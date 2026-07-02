import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  customers,
  editRequests,
  events,
  leads,
  prospects,
  sites,
  subscriptions,
} from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { createEditRequest, loadPortal, markLeadActioned, updatePortalSettings } from './portal'

const db = await createTestDb()

let seq = 0
async function seedSite(
  status: 'preview' | 'claimed' | 'live' | 'expired' | 'disabled' = 'live',
  options: { withCustomer?: boolean } = {},
) {
  seq += 1
  const [prospect] = await db
    .insert(prospects)
    .values({ businessName: `Portal Test ${seq} Ltd`, status: 'converted' })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug: `portal-test-${seq}`,
      status,
      claimToken: `portal-claim-${seq}`,
      portalToken: `portal-token-${seq}`,
    })
    .returning()
  let customer = null
  if (options.withCustomer ?? true) {
    ;[customer] = await db
      .insert(customers)
      .values({
        prospectId: prospect!.id,
        siteId: site!.id,
        email: `owner${seq}@portaltest.example`,
        leadAlertEmail: `alerts${seq}@portaltest.example`,
        stripeCustomerId: `cus_portal_${seq}`,
        status: 'active',
      })
      .returning()
  }
  return { prospect: prospect!, site: site!, customer: customer ?? null }
}

describe('loadPortal', () => {
  it('returns null for unknown tokens', async () => {
    expect(await loadPortal(db, 'nope')).toBeNull()
    expect(await loadPortal(db, '')).toBeNull()
  })

  it('assembles site, prospect, customer, ordered leads/edit requests and the latest subscription', async () => {
    const { site, prospect, customer } = await seedSite('live')
    await db.insert(leads).values([
      { siteId: site.id, source: 'form', name: 'Older', createdAt: new Date('2026-01-01') },
      { siteId: site.id, source: 'chatbot', name: 'Newer', createdAt: new Date('2026-02-01') },
    ])
    await db.insert(editRequests).values([
      {
        siteId: site.id,
        requestedBy: 'customer',
        body: 'older ask',
        createdAt: new Date('2026-01-01'),
      },
      {
        siteId: site.id,
        requestedBy: 'customer',
        body: 'newer ask',
        createdAt: new Date('2026-02-01'),
      },
    ])
    await db.insert(subscriptions).values([
      {
        customerId: customer!.id,
        stripeSubscriptionId: `sub_old_${site.slug}`,
        status: 'canceled',
        createdAt: new Date('2026-01-01'),
      },
      {
        customerId: customer!.id,
        stripeSubscriptionId: `sub_new_${site.slug}`,
        status: 'active',
        createdAt: new Date('2026-02-01'),
      },
    ])

    const portal = await loadPortal(db, site.portalToken!)
    expect(portal).not.toBeNull()
    expect(portal!.site.id).toBe(site.id)
    expect(portal!.prospect.id).toBe(prospect.id)
    expect(portal!.customer!.id).toBe(customer!.id)
    expect(portal!.leads.map((l) => l.name)).toEqual(['Newer', 'Older'])
    expect(portal!.editRequests.map((r) => r.body)).toEqual(['newer ask', 'older ask'])
    expect(portal!.subscription!.stripeSubscriptionId).toBe(`sub_new_${site.slug}`)
  })

  it('returns a null customer and subscription pre-claim', async () => {
    const { site } = await seedSite('preview', { withCustomer: false })
    const portal = await loadPortal(db, site.portalToken!)
    expect(portal!.customer).toBeNull()
    expect(portal!.subscription).toBeNull()
  })
})

describe('createEditRequest', () => {
  it('records the request and the audit event for a live site', async () => {
    const { site, prospect } = await seedSite('live')
    const result = await createEditRequest(db, {
      portalToken: site.portalToken!,
      body: 'Please swap the hero photo for one of our own van.',
    })
    expect(result).toMatchObject({ ok: true })

    const rows = await db.select().from(editRequests).where(eq(editRequests.siteId, site.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.requestedBy).toBe('customer')
    expect(rows[0]!.status).toBe('new')
    expect(rows[0]!.body).toContain('hero photo')

    const audit = await db.select().from(events).where(eq(events.siteId, site.id))
    const created = audit.filter((e) => e.type === 'edit_request_created')
    expect(created).toHaveLength(1)
    expect(created[0]!.prospectId).toBe(prospect.id)
    expect(created[0]!.payload).toMatchObject({ editRequestId: rows[0]!.id })
  })

  it('rejects out-of-bounds bodies without writing anything', async () => {
    const { site } = await seedSite('live')
    expect(
      'error' in (await createEditRequest(db, { portalToken: site.portalToken!, body: 'hi' })),
    ).toBe(true)
    expect(
      'error' in
        (await createEditRequest(db, { portalToken: site.portalToken!, body: 'x'.repeat(1001) })),
    ).toBe(true)
    expect(
      await db.select().from(editRequests).where(eq(editRequests.siteId, site.id)),
    ).toHaveLength(0)
  })

  it('rejects unclaimed sites and unknown tokens', async () => {
    const { site } = await seedSite('preview', { withCustomer: false })
    expect(
      'error' in
        (await createEditRequest(db, { portalToken: site.portalToken!, body: 'change the hours' })),
    ).toBe(true)
    expect(
      'error' in (await createEditRequest(db, { portalToken: 'nope', body: 'change the hours' })),
    ).toBe(true)
  })
})

describe('markLeadActioned', () => {
  it('sets actionedAt on the token’s own lead', async () => {
    const { site } = await seedSite('live')
    const [lead] = await db
      .insert(leads)
      .values({ siteId: site.id, source: 'form', name: 'Handle Me' })
      .returning()

    const result = await markLeadActioned(db, { portalToken: site.portalToken!, leadId: lead!.id })
    expect(result).toMatchObject({ ok: true })
    const [after] = await db.select().from(leads).where(eq(leads.id, lead!.id))
    expect(after!.actionedAt).not.toBeNull()
  })

  it('never touches another site’s leads (wrong-token isolation)', async () => {
    const { site: siteA } = await seedSite('live')
    const { site: siteB } = await seedSite('live')
    const [lead] = await db
      .insert(leads)
      .values({ siteId: siteA.id, source: 'form', name: 'Not Yours' })
      .returning()

    const result = await markLeadActioned(db, { portalToken: siteB.portalToken!, leadId: lead!.id })
    expect(result).toEqual({ error: 'Lead not found' })
    const [after] = await db.select().from(leads).where(eq(leads.id, lead!.id))
    expect(after!.actionedAt).toBeNull()
  })

  it('rejects unknown and malformed lead ids', async () => {
    const { site } = await seedSite('live')
    expect(
      await markLeadActioned(db, {
        portalToken: site.portalToken!,
        leadId: '00000000-0000-4000-8000-000000000000',
      }),
    ).toEqual({ error: 'Lead not found' })
    expect(
      await markLeadActioned(db, { portalToken: site.portalToken!, leadId: 'not-a-uuid' }),
    ).toEqual({ error: 'Lead not found' })
  })
})

describe('updatePortalSettings', () => {
  it('toggles the chatbot and records one event with the change', async () => {
    const { site } = await seedSite('live')
    const result = await updatePortalSettings(db, {
      portalToken: site.portalToken!,
      chatbotEnabled: false,
    })
    expect(result).toMatchObject({ ok: true })

    const [after] = await db.select().from(sites).where(eq(sites.id, site.id))
    expect(after!.chatbotEnabled).toBe(false)
    const audit = (await db.select().from(events).where(eq(events.siteId, site.id))).filter(
      (e) => e.type === 'portal_setting_changed',
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]!.payload).toEqual({ chatbotEnabled: false })
  })

  it('updates the lead alert email and validates it', async () => {
    const { site, customer } = await seedSite('live')
    const bad = await updatePortalSettings(db, {
      portalToken: site.portalToken!,
      leadAlertEmail: 'not-an-email',
    })
    expect('error' in bad).toBe(true)

    const result = await updatePortalSettings(db, {
      portalToken: site.portalToken!,
      leadAlertEmail: 'new-alerts@portaltest.example',
    })
    expect(result).toMatchObject({ ok: true })
    const [after] = await db.select().from(customers).where(eq(customers.id, customer!.id))
    expect(after!.leadAlertEmail).toBe('new-alerts@portaltest.example')
  })

  it('records both changes in a single event', async () => {
    const { site } = await seedSite('live')
    const result = await updatePortalSettings(db, {
      portalToken: site.portalToken!,
      chatbotEnabled: true,
      leadAlertEmail: 'both@portaltest.example',
    })
    expect(result).toMatchObject({ ok: true })
    const audit = (await db.select().from(events).where(eq(events.siteId, site.id))).filter(
      (e) => e.type === 'portal_setting_changed',
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]!.payload).toEqual({
      chatbotEnabled: true,
      leadAlertEmail: 'both@portaltest.example',
    })
  })

  it('rejects a lead alert email when no customer exists, empty updates and unknown tokens', async () => {
    const { site } = await seedSite('claimed', { withCustomer: false })
    expect(
      'error' in
        (await updatePortalSettings(db, {
          portalToken: site.portalToken!,
          leadAlertEmail: 'nobody@portaltest.example',
        })),
    ).toBe(true)
    expect('error' in (await updatePortalSettings(db, { portalToken: site.portalToken! }))).toBe(
      true,
    )
    expect(
      'error' in (await updatePortalSettings(db, { portalToken: 'nope', chatbotEnabled: false })),
    ).toBe(true)
  })
})
