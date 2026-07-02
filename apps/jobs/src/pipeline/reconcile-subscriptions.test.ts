import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { customers, events, prospects, sites, subscriptions } from '@tradies/db'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { EVENT_TYPES } from '@tradies/engine'
import { FixtureStripeClient, type StripeClient } from '@tradies/integrations'
import { reconcileSubscriptions } from './reconcile-subscriptions'

/**
 * The billing safety net: Stripe is the source of truth, the cron re-derives
 * lapse/recovery from it. One PGlite per file; every case seeds its own
 * prospect → site → customer → subscription chain.
 */

const NOW = new Date('2026-07-02T05:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

let db: TestDb
let seq = 0

beforeAll(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  await db.$client.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function seedChain(input: {
  siteStatus?: 'preview' | 'claimed' | 'live' | 'expired' | 'disabled'
  customerStatus?: string
  stripeSubscriptionId?: string | null
  subscriptionStatus?: string
}) {
  const n = ++seq
  const [prospect] = await db
    .insert(prospects)
    .values({ placeId: `ChIJreconcile-${n}`, businessName: `Reconcile Test ${n}` })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug: `reconcile-${n}`,
      status: input.siteStatus ?? 'live',
    })
    .returning()
  const [customer] = await db
    .insert(customers)
    .values({
      prospectId: prospect!.id,
      siteId: site!.id,
      email: `owner${n}@example.com`,
      status: input.customerStatus ?? 'active',
    })
    .returning()
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      customerId: customer!.id,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      status: input.subscriptionStatus ?? 'active',
    })
    .returning()
  return { prospect: prospect!, site: site!, customer: customer!, subscription: subscription! }
}

async function reload(seeded: Awaited<ReturnType<typeof seedChain>>) {
  const [site] = await db.select().from(sites).where(eq(sites.id, seeded.site.id))
  const [customer] = await db.select().from(customers).where(eq(customers.id, seeded.customer.id))
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, seeded.subscription.id))
  return { site: site!, customer: customer!, subscription: subscription! }
}

async function cleanChain(seeded: Awaited<ReturnType<typeof seedChain>>) {
  await db.delete(events).where(eq(events.siteId, seeded.site.id))
  await db.delete(subscriptions).where(eq(subscriptions.id, seeded.subscription.id))
  await db.delete(customers).where(eq(customers.id, seeded.customer.id))
  await db.delete(sites).where(eq(sites.id, seeded.site.id))
  await db.delete(prospects).where(eq(prospects.id, seeded.prospect.id))
}

describe('reconcileSubscriptions', () => {
  it('leaves an active subscription and its live site untouched', async () => {
    const stripe = new FixtureStripeClient()
    const { subscriptionId } = stripe.recordSubscription({ status: 'active' })
    const seeded = await seedChain({ stripeSubscriptionId: subscriptionId })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(result).toEqual({ checked: 1, disabled: 0, republished: 0 })

    const after = await reload(seeded)
    expect(after.site.status).toBe('live')
    expect(after.customer.status).toBe('active')
    expect(after.subscription.status).toBe('active')
    await cleanChain(seeded)
  })

  it('mirrors Stripe fields into the row and keeps a past_due site live within grace', async () => {
    const stripe = new FixtureStripeClient()
    const { subscriptionId } = stripe.recordSubscription({
      status: 'past_due',
      priceId: 'price_monthly',
      currentPeriodEnd: daysAgo(3),
    })
    const seeded = await seedChain({ stripeSubscriptionId: subscriptionId })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW, graceDays: 7 })
    expect(result).toEqual({ checked: 1, disabled: 0, republished: 0 })

    const after = await reload(seeded)
    expect(after.site.status).toBe('live')
    expect(after.customer.status).toBe('active')
    // the row now mirrors Stripe verbatim
    expect(after.subscription.status).toBe('past_due')
    expect(after.subscription.priceId).toBe('price_monthly')
    expect(after.subscription.currentPeriodEnd?.getTime()).toBe(daysAgo(3).getTime())
    await cleanChain(seeded)
  })

  it('disables a past_due site once the grace window is exhausted', async () => {
    const stripe = new FixtureStripeClient()
    const { subscriptionId } = stripe.recordSubscription({
      status: 'past_due',
      currentPeriodEnd: daysAgo(10),
    })
    const seeded = await seedChain({ stripeSubscriptionId: subscriptionId })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW, graceDays: 7 })
    expect(result).toEqual({ checked: 1, disabled: 1, republished: 0 })

    const after = await reload(seeded)
    expect(after.site.status).toBe('disabled')
    expect(after.site.noindex).toBe(true)
    expect(after.customer.status).toBe('canceled')

    const eventRows = await db.select().from(events).where(eq(events.siteId, seeded.site.id))
    const disabledEvent = eventRows.find((e) => e.type === EVENT_TYPES.siteDisabled)
    expect(disabledEvent?.actor).toBe('system')
    expect(disabledEvent?.payload).toMatchObject({ reason: 'subscription_lapsed' })
    await cleanChain(seeded)
  })

  it('disables on a canceled subscription and marks the customer canceled', async () => {
    const stripe = new FixtureStripeClient()
    const { subscriptionId } = stripe.recordSubscription({
      status: 'canceled',
      canceledAt: daysAgo(1),
    })
    const seeded = await seedChain({ stripeSubscriptionId: subscriptionId })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(result).toEqual({ checked: 1, disabled: 1, republished: 0 })

    const after = await reload(seeded)
    expect(after.site.status).toBe('disabled')
    expect(after.customer.status).toBe('canceled')
    expect(after.subscription.status).toBe('canceled')
    expect(after.subscription.canceledAt?.getTime()).toBe(daysAgo(1).getTime())

    // a second sweep is a no-op — the site is already disabled
    const again = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(again).toEqual({ checked: 1, disabled: 0, republished: 0 })
    await cleanChain(seeded)
  })

  it('republishes a disabled site whose subscription recovered to active', async () => {
    const stripe = new FixtureStripeClient()
    const { subscriptionId } = stripe.recordSubscription({ status: 'active' })
    const seeded = await seedChain({
      stripeSubscriptionId: subscriptionId,
      siteStatus: 'disabled',
      customerStatus: 'canceled',
      subscriptionStatus: 'past_due',
    })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(result).toEqual({ checked: 1, disabled: 0, republished: 1 })

    const after = await reload(seeded)
    expect(after.site.status).toBe('live')
    expect(after.site.noindex).toBe(false)
    expect(after.customer.status).toBe('active')
    expect(after.subscription.status).toBe('active')

    const eventRows = await db.select().from(events).where(eq(events.siteId, seeded.site.id))
    const published = eventRows.find((e) => e.type === EVENT_TYPES.sitePublished)
    expect(published?.payload).toMatchObject({ reason: 'subscription_recovered' })
    await cleanChain(seeded)
  })

  it('never republishes an erased customer, whatever Stripe says', async () => {
    const stripe = new FixtureStripeClient()
    const { subscriptionId } = stripe.recordSubscription({ status: 'active' })
    const seeded = await seedChain({
      stripeSubscriptionId: subscriptionId,
      siteStatus: 'disabled',
      customerStatus: 'erased',
    })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(result).toEqual({ checked: 1, disabled: 0, republished: 0 })

    const after = await reload(seeded)
    expect(after.site.status).toBe('disabled')
    expect(after.customer.status).toBe('erased')
    await cleanChain(seeded)
  })

  it('a Stripe error on one subscription does not abort the sweep', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fixture = new FixtureStripeClient()
    const bad = fixture.recordSubscription({ status: 'active' })
    const good = fixture.recordSubscription({ status: 'canceled' })
    const stripe: StripeClient = {
      createCheckoutSession: (input) => fixture.createCheckoutSession(input),
      createBillingPortalSession: (input) => fixture.createBillingPortalSession(input),
      verifyWebhook: (rawBody, signatureHeader) => fixture.verifyWebhook(rawBody, signatureHeader),
      getSubscription: async (id) => {
        if (id === bad.subscriptionId) throw new Error('stripe is down')
        return fixture.getSubscription(id)
      },
    }
    const badSeed = await seedChain({ stripeSubscriptionId: bad.subscriptionId })
    const goodSeed = await seedChain({ stripeSubscriptionId: good.subscriptionId })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(result).toEqual({ checked: 2, disabled: 1, republished: 0 })
    expect(warn).toHaveBeenCalledOnce()

    const badAfter = await reload(badSeed)
    expect(badAfter.site.status).toBe('live') // untouched — the fetch failed
    const goodAfter = await reload(goodSeed)
    expect(goodAfter.site.status).toBe('disabled') // still processed
    await cleanChain(badSeed)
    await cleanChain(goodSeed)
  })

  it('skips subscriptions without a Stripe id (pending checkout)', async () => {
    const stripe = new FixtureStripeClient()
    const seeded = await seedChain({ stripeSubscriptionId: null })

    const result = await reconcileSubscriptions(db, stripe, { now: NOW })
    expect(result).toEqual({ checked: 0, disabled: 0, republished: 0 })
    await cleanChain(seeded)
  })
})
