import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  customers,
  editRequests,
  events,
  leads,
  prospects,
  sites,
  subscriptions,
  type CustomerRow,
  type Db,
  type EditRequestRow,
  type LeadRow,
  type Prospect,
  type SiteRow,
  type SubscriptionRow,
} from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'

/**
 * The customer portal's testable core. A portal token identifies exactly one
 * site; every query below is scoped through that site so one customer's token
 * can never read or touch another site's leads, edit requests or settings.
 * Pure db-in/db-out — Stripe and mail live in the actions/routes that compose
 * this.
 */

export type PortalContext = {
  site: SiteRow
  prospect: Prospect
  /** Null until the claim flow has created the customer row. */
  customer: CustomerRow | null
  /** Newest first. */
  leads: LeadRow[]
  /** Newest first. */
  editRequests: EditRequestRow[]
  /** The latest subscription, if any. */
  subscription: SubscriptionRow | null
}

export type PortalActionResult = { ok: true; editRequestId?: string } | { error: string }

/** Site statuses that have a working dashboard behind the portal token. */
const PORTAL_ACTIVE_STATUSES = new Set<SiteRow['status']>(['claimed', 'live', 'disabled'])

async function loadSiteByToken(db: Db, portalToken: string): Promise<SiteRow | null> {
  if (!portalToken) return null
  const [site] = await db.select().from(sites).where(eq(sites.portalToken, portalToken)).limit(1)
  return site ?? null
}

export async function loadPortal(db: Db, portalToken: string): Promise<PortalContext | null> {
  const site = await loadSiteByToken(db, portalToken)
  if (!site) return null
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, site.prospectId))
    .limit(1)
  if (!prospect) return null

  const [customer] = await db.select().from(customers).where(eq(customers.siteId, site.id)).limit(1)
  const siteLeads = await db
    .select()
    .from(leads)
    .where(eq(leads.siteId, site.id))
    .orderBy(desc(leads.createdAt))
  const siteEditRequests = await db
    .select()
    .from(editRequests)
    .where(eq(editRequests.siteId, site.id))
    .orderBy(desc(editRequests.createdAt))

  let subscription: SubscriptionRow | null = null
  if (customer) {
    const [latest] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
    subscription = latest ?? null
  }

  return {
    site,
    prospect,
    customer: customer ?? null,
    leads: siteLeads,
    editRequests: siteEditRequests,
    subscription,
  }
}

const editRequestBodySchema = z.string().trim().min(5).max(1000)

export async function createEditRequest(
  db: Db,
  input: { portalToken: string; body: string },
): Promise<PortalActionResult> {
  const site = await loadSiteByToken(db, input.portalToken)
  if (!site) return { error: 'Link not recognised' }
  if (!PORTAL_ACTIVE_STATUSES.has(site.status)) {
    return { error: 'This website has not been claimed yet' }
  }
  const parsed = editRequestBodySchema.safeParse(input.body)
  if (!parsed.success) {
    return { error: 'Please describe the change in 5 to 1000 characters' }
  }

  const [editRequest] = await db
    .insert(editRequests)
    .values({ siteId: site.id, requestedBy: 'customer', body: parsed.data, status: 'new' })
    .returning()
  if (!editRequest) return { error: 'Failed to record the request' }

  await db.insert(events).values({
    prospectId: site.prospectId,
    siteId: site.id,
    actor: 'customer',
    type: EVENT_TYPES.editRequestCreated,
    payload: { editRequestId: editRequest.id },
  })
  return { ok: true, editRequestId: editRequest.id }
}

export async function markLeadActioned(
  db: Db,
  input: { portalToken: string; leadId: string },
): Promise<PortalActionResult> {
  const site = await loadSiteByToken(db, input.portalToken)
  if (!site) return { error: 'Link not recognised' }
  if (!z.string().uuid().safeParse(input.leadId).success) return { error: 'Lead not found' }

  // scoping by siteId is the isolation guarantee — another site's lead id is a miss
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.siteId, site.id)))
    .limit(1)
  if (!lead) return { error: 'Lead not found' }

  const now = new Date()
  await db
    .update(leads)
    .set({ actionedAt: lead.actionedAt ?? now, updatedAt: now })
    .where(eq(leads.id, lead.id))
  return { ok: true }
}

const settingsSchema = z.object({
  chatbotEnabled: z.boolean().optional(),
  leadAlertEmail: z.string().trim().email().max(254).optional(),
})

export async function updatePortalSettings(
  db: Db,
  input: { portalToken: string; chatbotEnabled?: boolean; leadAlertEmail?: string },
): Promise<PortalActionResult> {
  const site = await loadSiteByToken(db, input.portalToken)
  if (!site) return { error: 'Link not recognised' }

  const parsed = settingsSchema.safeParse({
    chatbotEnabled: input.chatbotEnabled,
    leadAlertEmail: input.leadAlertEmail,
  })
  if (!parsed.success) return { error: 'Please enter a valid email address' }
  const { chatbotEnabled, leadAlertEmail } = parsed.data
  if (chatbotEnabled === undefined && leadAlertEmail === undefined) {
    return { error: 'Nothing to update' }
  }

  const now = new Date()
  const changed: { chatbotEnabled?: boolean; leadAlertEmail?: string } = {}

  if (leadAlertEmail !== undefined) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.siteId, site.id))
      .limit(1)
    if (!customer) return { error: 'No customer account on this site yet' }
    await db
      .update(customers)
      .set({ leadAlertEmail, updatedAt: now })
      .where(eq(customers.id, customer.id))
    changed.leadAlertEmail = leadAlertEmail
  }
  if (chatbotEnabled !== undefined) {
    await db.update(sites).set({ chatbotEnabled, updatedAt: now }).where(eq(sites.id, site.id))
    changed.chatbotEnabled = chatbotEnabled
  }

  // one audit event per settings save, carrying exactly what changed
  await db.insert(events).values({
    prospectId: site.prospectId,
    siteId: site.id,
    actor: 'customer',
    type: EVENT_TYPES.portalSettingChanged,
    payload: changed,
  })
  return { ok: true }
}
