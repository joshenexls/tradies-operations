import { and, desc, eq, notInArray } from 'drizzle-orm'
import {
  events,
  outreachCampaigns,
  outreachMessages,
  pitches,
  prospectCosts,
  prospects,
  suppressionList,
  type Db,
  type OutreachCampaignRow,
} from '@tradies/db'
import {
  assertColdEmailAllowed,
  buildLegalFooter,
  checkSuppression,
  validateLegalFooter,
  ComplianceError,
  type LegalFooterInput,
  type SuppressionEntry,
} from '@tradies/compliance'
import { EVENT_TYPES } from '@tradies/engine'
import {
  buildUnsubscribeToken,
  resolveUnsubscribeSecret,
  type SmartleadClient,
} from '@tradies/integrations'
import { resolveSmartlead } from '../lib/clients'

/**
 * Outreach dispatch. The gates run first and are non-negotiable — a prospect
 * the operator has not marked corporate can never reach a cold-email queue,
 * dry run or not — and the Postgres CHECK on outreach_messages is the last
 * line of defense behind them. Gate failures don't throw: they record why and
 * leave the prospect awaiting operator classification.
 *
 * Dry run (OUTREACH_DRY_RUN=1, the default) does everything except talk to
 * Smartlead: campaign row (provider id null) + queued outreach_messages row
 * with the full legal footer, so the operator can inspect exactly what would
 * go out. Real dispatch additionally creates the Smartlead campaign, pushes
 * the lead + sequence, and flips the message to approved.
 */
export async function dispatchOutreach(
  db: Db,
  input: { prospectId: string; dryRun?: boolean; smartlead?: SmartleadClient },
): Promise<{
  dispatched: boolean
  blockedReason?: string
  messageId?: string
  campaignId?: string
}> {
  const dryRun = input.dryRun ?? process.env.OUTREACH_DRY_RUN !== '0'
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1)
  if (!prospect) throw new Error(`unknown prospect ${input.prospectId}`)

  const email = prospect.extractedProfile?.email?.value

  const entries = (await db.select().from(suppressionList)) as SuppressionEntry[]
  const suppression = checkSuppression(entries, {
    email: email ?? undefined,
    phone: prospect.phone ?? undefined,
    placeId: prospect.placeId ?? undefined,
  })

  try {
    if (suppression.suppressed) {
      throw new ComplianceError('suppressed', 'prospect matches the global suppression list')
    }
    assertColdEmailAllowed({
      entityType: prospect.entityType,
      entityCheckedAt: prospect.entityCheckedAt,
    })
  } catch (err) {
    const code = err instanceof ComplianceError ? err.code : 'unknown'
    await db.insert(events).values({
      prospectId: prospect.id,
      actor: 'system',
      type: EVENT_TYPES.outreachBlocked,
      payload: { code, dryRun },
    })
    return { dispatched: false, blockedReason: code }
  }

  // Gates passed — from here on, failures are operational errors, not
  // compliance outcomes, so they throw.
  const smartlead = input.smartlead ?? resolveSmartlead()
  const campaign = await getOrCreateCampaign(db, {
    trade: prospect.trade ?? 'other',
    city: prospect.city ?? 'unknown',
    dryRun,
    smartlead,
  })

  const [pitch] = await db
    .select()
    .from(pitches)
    .where(eq(pitches.prospectId, prospect.id))
    .orderBy(desc(pitches.version))
    .limit(1)
  if (!pitch) {
    throw new Error(
      `prospect ${prospect.id} has no pitch — generate_pitch must run before dispatch`,
    )
  }

  // Legal footer: appended at queue time (never stored on the pitch) and
  // asserted complete before the row is written.
  const footerInput = buildFooterInput(prospect.id)
  const body = `${pitch.body}\n\n${buildLegalFooter(footerInput)}`
  const missing = validateLegalFooter(body, footerInput)
  if (missing.length > 0) {
    throw new Error(`outreach body failed the legal footer check — missing: ${missing.join(', ')}`)
  }

  // The INSERT below is also guarded by the DB CHECK
  // (outreach_messages_pecr_cold_email_corporate_only): if a bug ever let a
  // non-corporate prospect through the gates above, Postgres rejects the row.
  const [message] = await db
    .insert(outreachMessages)
    .values({
      prospectId: prospect.id,
      campaignId: campaign.id,
      step: 1,
      channel: 'email_cold',
      subject: pitch.subject,
      body,
      legalBasis: 'legitimate_interest_corporate',
      entityTypeAtQueue: prospect.entityType,
      status: 'queued',
    })
    .returning()
  if (!message) throw new Error('failed to insert outreach message row')

  if (dryRun) {
    await db.insert(events).values({
      prospectId: prospect.id,
      actor: 'system',
      type: EVENT_TYPES.outreachDryRun,
      payload: {
        dryRun,
        entityType: prospect.entityType,
        messageId: message.id,
        campaignId: campaign.id,
        pitchVersion: pitch.version,
      },
    })
    return { dispatched: false, messageId: message.id, campaignId: campaign.id }
  }

  if (!email) {
    throw new Error(
      `prospect ${prospect.id} has no evidenced email address — cannot push a Smartlead lead`,
    )
  }
  if (!campaign.smartleadCampaignId) {
    throw new Error(`campaign ${campaign.id} has no Smartlead campaign id`)
  }
  const { leadId } = await smartlead.addLead({
    campaignId: campaign.smartleadCampaignId,
    lead: {
      email,
      company: prospect.businessName ?? undefined,
      customFields: pitch.previewUrl ? { preview_url: pitch.previewUrl } : undefined,
    },
    sequence: [{ step: 1, subject: pitch.subject, body }],
  })

  await db
    .update(outreachMessages)
    .set({ status: 'approved', smartleadLeadId: leadId, updatedAt: new Date() })
    .where(eq(outreachMessages.id, message.id))
  await db
    .update(prospects)
    .set({ status: 'outreach_queued', updatedAt: new Date() })
    .where(eq(prospects.id, prospect.id))
  await db.insert(prospectCosts).values({
    prospectId: prospect.id,
    category: 'email',
    provider: 'smartlead',
    units: '1',
    amountMicroGbp: Number(process.env.SMARTLEAD_COST_PER_SEND_MICROGBP ?? 0),
    ref: message.id,
  })
  await db.insert(events).values({
    prospectId: prospect.id,
    actor: 'system',
    type: 'outreach_dispatched',
    payload: {
      messageId: message.id,
      campaignId: campaign.id,
      smartleadCampaignId: campaign.smartleadCampaignId,
      smartleadLeadId: leadId,
      pitchVersion: pitch.version,
    },
  })
  return { dispatched: true, messageId: message.id, campaignId: campaign.id }
}

/**
 * One campaign per (city, trade) so Smartlead sequences stay thematically
 * coherent. The row exists even in dry run (provider id null); the Smartlead
 * campaign itself is only created for real dispatch — including lazily when a
 * campaign born in dry run later dispatches for real.
 */
async function getOrCreateCampaign(
  db: Db,
  input: { trade: string; city: string; dryRun: boolean; smartlead: SmartleadClient },
): Promise<OutreachCampaignRow> {
  const name = `${input.trade} ${input.city}`
  let [campaign] = await db
    .select()
    .from(outreachCampaigns)
    .where(and(eq(outreachCampaigns.name, name), eq(outreachCampaigns.channel, 'email_cold')))
    .limit(1)
  if (!campaign) {
    ;[campaign] = await db
      .insert(outreachCampaigns)
      .values({
        name,
        channel: 'email_cold',
        sendingDomain: process.env.OUTREACH_SENDING_DOMAIN ?? null,
      })
      .returning()
    if (!campaign) throw new Error('failed to insert outreach campaign row')
  }
  if (!input.dryRun && !campaign.smartleadCampaignId) {
    const { campaignId } = await input.smartlead.createCampaign({
      name,
      sendingDomain: campaign.sendingDomain ?? undefined,
    })
    const [updated] = await db
      .update(outreachCampaigns)
      .set({ smartleadCampaignId: campaignId, updatedAt: new Date() })
      .where(eq(outreachCampaigns.id, campaign.id))
      .returning()
    if (updated) campaign = updated
  }
  return campaign
}

/** Legal footer content from the operator env (see report for the key list). */
export function buildFooterInput(
  prospectId: string,
  env: NodeJS.ProcessEnv = process.env,
): LegalFooterInput {
  const base = (env.UNSUBSCRIBE_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '')
  const token = buildUnsubscribeToken(prospectId, resolveUnsubscribeSecret(env))
  return {
    tradingName: env.OPERATOR_BRAND_NAME ?? 'Tradies Studio',
    companyName: env.OPERATOR_LEGAL_NAME ?? 'Tradies Studio Ltd',
    companyNumber: env.OPERATOR_COMPANY_NUMBER ?? '00000000',
    registeredOffice: env.OPERATOR_REGISTERED_OFFICE ?? '1 Example Street, Leeds, LS1 1AA',
    priceLine: env.PRICE_LINE ?? '£19.99/month',
    unsubscribeUrl: `${base}/u/${token}`,
    privacyNoticeUrl: env.PRIVACY_NOTICE_URL ?? `${base}/privacy`,
  }
}

const TERMINAL_STATUSES = ['replied', 'bounced', 'unsubscribed', 'blocked_compliance'] as const

/**
 * Daily reconciliation pass over non-terminal outreach messages. Webhooks are
 * the primary status source; this is the safety net for missed deliveries.
 * Fixture-safe: without a real Smartlead client configured it only counts.
 */
export async function reconcileOutreach(
  db: Db,
  opts: { realConfigured?: boolean } = {},
): Promise<{ checked: number; synced: number }> {
  const open = await db
    .select({ id: outreachMessages.id, status: outreachMessages.status })
    .from(outreachMessages)
    .where(notInArray(outreachMessages.status, [...TERMINAL_STATUSES]))
  const realConfigured = opts.realConfigured ?? Boolean(process.env.SMARTLEAD_API_KEY)
  if (!realConfigured) return { checked: open.length, synced: 0 }
  // Real re-sync would page Smartlead's campaign statistics here and re-apply
  // the same status mapping the webhook route uses. Deliberately minimal until
  // volume shows webhooks alone are insufficient.
  return { checked: open.length, synced: 0 }
}
