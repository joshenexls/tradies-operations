import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { customers, events, leads, prospects, sites } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { FixtureResendMailer, type ResendMailer } from '@tradies/integrations'
import { scheduleLeadAlert, sendLeadAlert } from './lead-alerts'

const db = await createTestDb()
const ORIGIN = { origin: 'http://apex.localhost:3000' }

let seq = 0
async function seedSite(
  status: 'preview' | 'claimed' | 'live' = 'live',
  options: { withCustomer?: boolean; leadAlertEmail?: string | null } = {},
) {
  seq += 1
  const [prospect] = await db
    .insert(prospects)
    .values({ businessName: `Alert Test ${seq} Ltd`, status: 'converted' })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug: `alert-test-${seq}`,
      status,
      portalToken: `alert-portal-${seq}`,
    })
    .returning()
  const alertEmail =
    options.leadAlertEmail === undefined ? `alerts${seq}@alerttest.example` : options.leadAlertEmail
  if (options.withCustomer ?? true) {
    await db.insert(customers).values({
      prospectId: prospect!.id,
      siteId: site!.id,
      email: `owner${seq}@alerttest.example`,
      leadAlertEmail: alertEmail,
      status: 'active',
    })
  }
  return { prospect: prospect!, site: site!, alertEmail }
}

async function seedLead(siteId: string, overrides: Partial<typeof leads.$inferInsert> = {}) {
  const [lead] = await db
    .insert(leads)
    .values({
      siteId,
      source: 'form',
      name: 'Sarah Wilson',
      phone: '0113 496 0000',
      email: 'sarah@visitor.example',
      message: 'Need a quote for a bathroom refit.',
      ...overrides,
    })
    .returning()
  return lead!
}

describe('sendLeadAlert', () => {
  it('emails the customer and marks the lead for a live site', async () => {
    const { site, prospect, alertEmail } = await seedSite('live')
    const lead = await seedLead(site.id)
    const mailer = new FixtureResendMailer()

    await sendLeadAlert(db, mailer, lead.id, ORIGIN)

    expect(mailer.sends).toHaveLength(1)
    const sent = mailer.sends[0]!
    expect(sent.to).toBe(alertEmail)
    expect(sent.subject).toBe(`New lead for ${prospect.businessName}: Sarah Wilson`)
    expect(sent.text).toContain('0113 496 0000')
    expect(sent.text).toContain('bathroom refit')
    expect(sent.text).toContain(`http://${site.slug}.localhost:3000/portal/${site.portalToken}`)

    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id))
    expect(after!.notifiedAt).not.toBeNull()
    expect(after!.notificationChannel).toBe('email')
    const audit = (await db.select().from(events).where(eq(events.siteId, site.id))).filter(
      (e) => e.type === 'lead_alert_sent',
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]!.payload).toMatchObject({ leadId: lead.id })
  })

  it('labels nameless leads as Website visitor', async () => {
    const { site } = await seedSite('claimed')
    const lead = await seedLead(site.id, { name: null })
    const mailer = new FixtureResendMailer()
    await sendLeadAlert(db, mailer, lead.id, ORIGIN)
    expect(mailer.sends[0]!.subject).toContain(': Website visitor')
  })

  it('does not alert for preview sites or customers without an alert email', async () => {
    const { site: previewSite } = await seedSite('preview')
    const previewLead = await seedLead(previewSite.id)
    const { site: quietSite } = await seedSite('live', { leadAlertEmail: null })
    const quietLead = await seedLead(quietSite.id)
    const { site: orphanSite } = await seedSite('live', { withCustomer: false })
    const orphanLead = await seedLead(orphanSite.id)
    const mailer = new FixtureResendMailer()

    await sendLeadAlert(db, mailer, previewLead.id, ORIGIN)
    await sendLeadAlert(db, mailer, quietLead.id, ORIGIN)
    await sendLeadAlert(db, mailer, orphanLead.id, ORIGIN)

    expect(mailer.sends).toHaveLength(0)
    const [after] = await db.select().from(leads).where(eq(leads.id, previewLead.id))
    expect(after!.notifiedAt).toBeNull()
  })

  it('is idempotent — an already-notified lead is never re-sent', async () => {
    const { site } = await seedSite('live')
    const lead = await seedLead(site.id)
    const mailer = new FixtureResendMailer()

    await sendLeadAlert(db, mailer, lead.id, ORIGIN)
    await sendLeadAlert(db, mailer, lead.id, ORIGIN)
    expect(mailer.sends).toHaveLength(1)
  })

  it('never throws on mailer failure and leaves the lead unmarked', async () => {
    const { site } = await seedSite('live')
    const lead = await seedLead(site.id)
    const broken: ResendMailer = {
      send: async () => {
        throw new Error('resend is down')
      },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(sendLeadAlert(db, broken, lead.id, ORIGIN)).resolves.toBeUndefined()

    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id))
    expect(after!.notifiedAt).toBeNull()
    const audit = (await db.select().from(events).where(eq(events.siteId, site.id))).filter(
      (e) => e.type === 'lead_alert_sent',
    )
    expect(audit).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('scheduleLeadAlert', () => {
  it('falls back to firing inline outside a Next request scope', async () => {
    const { site } = await seedSite('live')
    const lead = await seedLead(site.id)
    const mailer = new FixtureResendMailer()

    // no request scope here, so after() throws internally and the task runs inline
    scheduleLeadAlert(db, mailer, lead.id, ORIGIN)

    await vi.waitFor(async () => {
      const [after] = await db.select().from(leads).where(eq(leads.id, lead.id))
      expect(after!.notifiedAt).not.toBeNull()
    })
    expect(mailer.sends).toHaveLength(1)
  })
})
