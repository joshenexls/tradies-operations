import { beforeAll, describe, expect, it } from 'vitest'
import { customers, prospects, sites, subscriptions } from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { customerStats, listCustomers, type CustomerListRow } from './customers'

/**
 * Customers screen data on the real migrations: the join carries business
 * name + site + latest subscription, and the MRR stats are pure arithmetic
 * over the rows. One PGlite per file; every test seeds its own keyed rows.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

async function seedCustomer(key: string) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      placeId: `ChIJcustomers-${key}`,
      businessName: `Swift Flow ${key}`,
      status: 'converted',
    })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug: `swift-flow-${key}`,
      status: 'live',
      claimToken: `claim-${key}`,
      portalToken: `portal-${key}`,
    })
    .returning()
  const [customer] = await db
    .insert(customers)
    .values({
      prospectId: prospect!.id,
      siteId: site!.id,
      email: `owner@${key}.example`,
      stripeCustomerId: `cus_${key}`,
      status: 'active',
    })
    .returning()
  return { prospect: prospect!, site: site!, customer: customer! }
}

/** customerStats only reads subscription.status — a stub row is enough. */
function statsRow(status: string | null | undefined): CustomerListRow {
  return { subscription: status === undefined ? null : { status } } as CustomerListRow
}

describe('listCustomers', () => {
  it('joins site + prospect and keeps only the LATEST subscription per customer', async () => {
    const { customer, site } = await seedCustomer('latest')
    await db.insert(subscriptions).values({
      customerId: customer.id,
      stripeSubscriptionId: 'sub_latest_old',
      status: 'canceled',
      canceledAt: new Date('2026-01-15T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    await db.insert(subscriptions).values({
      customerId: customer.id,
      stripeSubscriptionId: 'sub_latest_new',
      status: 'active',
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })

    const rows = await listCustomers(db)
    const row = rows.find((r) => r.customer.id === customer.id)
    expect(row).toBeDefined()
    expect(row?.businessName).toBe('Swift Flow latest')
    expect(row?.site.id).toBe(site.id)
    expect(row?.site.slug).toBe('swift-flow-latest')
    // one row per customer, carrying the newest subscription
    expect(rows.filter((r) => r.customer.id === customer.id)).toHaveLength(1)
    expect(row?.subscription?.stripeSubscriptionId).toBe('sub_latest_new')
    expect(row?.subscription?.status).toBe('active')
  })

  it('keeps customers without any subscription (pending checkout)', async () => {
    const { customer } = await seedCustomer('nosub')
    const rows = await listCustomers(db)
    const row = rows.find((r) => r.customer.id === customer.id)
    expect(row).toBeDefined()
    expect(row?.subscription).toBeNull()
  })
})

describe('customerStats', () => {
  it('counts active + trialing subscriptions and multiplies by the price', () => {
    const rows = [
      statsRow('active'),
      statsRow('trialing'),
      statsRow('past_due'),
      statsRow('canceled'),
      statsRow(null),
      statsRow(undefined), // no subscription row at all
    ]
    expect(customerStats(rows, 1999)).toEqual({ activeCount: 2, mrrPence: 3998 })
  })

  it('is zero on an empty book', () => {
    expect(customerStats([], 1999)).toEqual({ activeCount: 0, mrrPence: 0 })
  })
})
