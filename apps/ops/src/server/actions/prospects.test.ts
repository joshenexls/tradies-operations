import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  chatSessions,
  customers,
  editRequests,
  events,
  leads,
  prospects,
  sites,
  subscriptions,
  suppressionList,
} from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { EVENT_TYPES } from '@tradies/engine'
import { eraseProspect } from './prospects'

/**
 * GDPR erasure across the whole claimed-site chain: prospect PII, lead and
 * chat rows, free-text edit requests and the customer contact fields all go;
 * the billing trail (subscriptions rows + customers.stripeCustomerId) is
 * deliberately retained under the legal-obligation lawful basis.
 *
 * The server-action module is imported with next/cache and the app db module
 * mocked — the action runs against a per-file PGlite instead.
 */

const holder = vi.hoisted(() => ({ db: undefined as unknown }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb: () => holder.db }))

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  holder.db = db
})

afterAll(async () => {
  await db.$client.close()
})

async function seedClaimedSite(n: number) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      placeId: `ChIJerasure-${n}`,
      businessName: 'Erase Me Plumbing',
      phone: '07700 900123',
      extractedProfile: {
        businessName: 'Erase Me Plumbing',
        email: { value: 'owner@eraseme.example', source: 'own_website' },
      },
    })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({ prospectId: prospect!.id, slug: `erase-me-${n}`, status: 'live' })
    .returning()
  const [customer] = await db
    .insert(customers)
    .values({
      prospectId: prospect!.id,
      siteId: site!.id,
      email: 'owner@eraseme.example',
      leadAlertEmail: 'alerts@eraseme.example',
      leadAlertPhone: '07700 900123',
      intake: { confirmedName: 'Erase Me Plumbing', tosAcceptedAt: '2026-01-01T00:00:00Z' },
      stripeCustomerId: `cus_erasure_${n}`,
      status: 'active',
    })
    .returning()
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      customerId: customer!.id,
      stripeSubscriptionId: `sub_erasure_${n}`,
      status: 'active',
    })
    .returning()
  await db.insert(editRequests).values([
    { siteId: site!.id, requestedBy: 'customer', body: 'Please change my number to 07700 900456' },
    { siteId: site!.id, requestedBy: 'customer', body: 'Add my name, Joe Bloggs, to the footer' },
  ])
  await db
    .insert(leads)
    .values({ siteId: site!.id, source: 'form', name: 'A Caller', phone: '07700 900789' })
  await db.insert(chatSessions).values({ siteId: site!.id, visitorId: 'v-1' })
  return { prospect: prospect!, site: site!, customer: customer!, subscription: subscription! }
}

describe('eraseProspect', () => {
  it('erases customer PII and edit requests but retains the billing trail', async () => {
    const { prospect, site, customer, subscription } = await seedClaimedSite(1)

    expect(await eraseProspect(prospect.id)).toEqual({ ok: true })

    // prospect PII stripped, suppression recorded so we never contact them again
    const [prospectAfter] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(prospectAfter?.businessName).toBe('[erased]')
    expect(prospectAfter?.phone).toBeNull()
    expect(prospectAfter?.extractedProfile).toBeNull()
    expect(prospectAfter?.status).toBe('suppressed')
    const entries = await db
      .select()
      .from(suppressionList)
      .where(eq(suppressionList.prospectId, prospect.id))
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.reason === 'erasure')).toBe(true)

    // site offline; per-site PII rows gone
    const [siteAfter] = await db.select().from(sites).where(eq(sites.id, site.id))
    expect(siteAfter?.status).toBe('disabled')
    expect(await db.select().from(leads).where(eq(leads.siteId, site.id))).toHaveLength(0)
    expect(
      await db.select().from(chatSessions).where(eq(chatSessions.siteId, site.id)),
    ).toHaveLength(0)

    // free-text edit requests deleted
    expect(
      await db.select().from(editRequests).where(eq(editRequests.siteId, site.id)),
    ).toHaveLength(0)

    // customer contact fields nulled, lifecycle 'erased' …
    const [customerAfter] = await db.select().from(customers).where(eq(customers.id, customer.id))
    expect(customerAfter?.email).toBeNull()
    expect(customerAfter?.leadAlertEmail).toBeNull()
    expect(customerAfter?.leadAlertPhone).toBeNull()
    expect(customerAfter?.intake).toBeNull()
    expect(customerAfter?.status).toBe('erased')
    // … but the billing trail is retained (legal-obligation basis; Stripe-side
    // deletion is a manual runbook step)
    expect(customerAfter?.stripeCustomerId).toBe('cus_erasure_1')
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
    expect(subs).toHaveLength(1)
    expect(subs[0]?.id).toBe(subscription.id)
    expect(subs[0]?.stripeSubscriptionId).toBe('sub_erasure_1')

    // the audit event enumerates what went and what was kept
    const eventRows = await db.select().from(events).where(eq(events.prospectId, prospect.id))
    const completed = eventRows.find((e) => e.type === EVENT_TYPES.erasureCompleted)
    expect(completed?.payload).toMatchObject({
      erased: expect.arrayContaining(['customer_pii', 'edit_requests', 'leads', 'site_specs']),
      retained: ['subscriptions', 'customers.stripeCustomerId'],
    })
  })

  it('still erases an unclaimed prospect (no site, no customer row)', async () => {
    const [prospect] = await db
      .insert(prospects)
      .values({ placeId: 'ChIJerasure-unclaimed', businessName: 'Never Claimed Ltd' })
      .returning()

    expect(await eraseProspect(prospect!.id)).toEqual({ ok: true })

    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect!.id))
    expect(after?.businessName).toBe('[erased]')
    const eventRows = await db.select().from(events).where(eq(events.prospectId, prospect!.id))
    const completed = eventRows.find((e) => e.type === EVENT_TYPES.erasureCompleted)
    expect(completed?.payload).toMatchObject({ erased: ['prospect_pii', 'site_specs'] })
  })

  it('returns an error for an unknown prospect', async () => {
    expect(await eraseProspect('00000000-0000-0000-0000-000000000000')).toEqual({
      error: 'Prospect not found',
    })
  })
})
