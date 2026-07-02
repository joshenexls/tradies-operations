import { eq } from 'drizzle-orm'
import { after } from 'next/server'
import { customers, events, leads, prospects, sites, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'
import type { ResendMailer } from '@tradies/integrations'
import { tenantOrigin } from '@/lib/stripe'

/**
 * New-lead email alerts. Sent only for claimed/live sites whose customer has
 * a lead alert address, and at most once per lead (notifiedAt is the
 * idempotency marker). Callers run this after the response — a broken mailer
 * must never break lead capture, so it warns and returns instead of throwing.
 */
export async function sendLeadAlert(
  db: Db,
  mailer: ResendMailer,
  leadId: string,
  opts: { origin: string },
): Promise<void> {
  try {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1)
    if (!lead || lead.notifiedAt) return
    const [site] = await db.select().from(sites).where(eq(sites.id, lead.siteId)).limit(1)
    if (!site || (site.status !== 'claimed' && site.status !== 'live')) return
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.siteId, site.id))
      .limit(1)
    if (!customer?.leadAlertEmail) return
    const [prospect] = await db
      .select({ businessName: prospects.businessName })
      .from(prospects)
      .where(eq(prospects.id, site.prospectId))
      .limit(1)

    const businessName = prospect?.businessName ?? site.slug
    const visitorName = lead.name ?? 'Website visitor'
    const origin = tenantOrigin(opts.origin, site.slug)
    const text = [
      `You have a new lead from your website.`,
      '',
      `Name: ${visitorName}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.message ? `Message: ${lead.message}` : null,
      `Source: ${lead.source === 'chatbot' ? 'website chat assistant' : 'website contact form'}`,
      '',
      `See all your leads and mark them handled in your dashboard:`,
      `${origin}/portal/${site.portalToken}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n')

    const { providerId } = await mailer.send({
      from: process.env.LEAD_ALERT_FROM_EMAIL ?? process.env.INBOX_FROM_EMAIL ?? 'leads@localhost',
      to: customer.leadAlertEmail,
      subject: `New lead for ${businessName}: ${visitorName}`,
      text,
    })

    const now = new Date()
    await db
      .update(leads)
      .set({ notifiedAt: now, notificationChannel: 'email', updatedAt: now })
      .where(eq(leads.id, lead.id))
    await db.insert(events).values({
      prospectId: site.prospectId,
      siteId: site.id,
      actor: 'system',
      type: EVENT_TYPES.leadAlertSent,
      payload: { leadId: lead.id, to: customer.leadAlertEmail, providerId },
    })
  } catch (err) {
    // alerting must never break lead capture — the reconcile round can re-derive
    console.warn('[lead-alerts] send failed:', err)
  }
}

/**
 * Queue the alert to run after the response via after(). Direct route
 * invocation (unit tests) has no Next request scope and after() throws there,
 * so fall back to firing inline — sendLeadAlert itself never rejects.
 */
export function scheduleLeadAlert(
  db: Db,
  mailer: ResendMailer,
  leadId: string,
  opts: { origin: string },
): void {
  const run = () => sendLeadAlert(db, mailer, leadId, opts)
  try {
    after(run)
  } catch {
    void run()
  }
}
