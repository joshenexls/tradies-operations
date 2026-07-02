import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { customers, events, prospects, sites, subscriptions } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { FixtureResendMailer, type StripeWebhookEvent } from '@tradies/integrations'
import { handleStripeEvent } from './stripe-webhook'

const db = await createTestDb()
const OPTS = { requestOrigin: 'http://app.localhost:3000' }

let seq = 0
async function seedPendingCheckout() {
  seq += 1
  const [prospect] = await db
    .insert(prospects)
    .values({ businessName: `Webhook Test ${seq} Ltd`, status: 'claimed' })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug: `webhook-test-${seq}`,
      status: 'preview',
      claimToken: `wh-claim-${seq}`,
      portalToken: `wh-portal-${seq}`,
    })
    .returning()
  const [customer] = await db
    .insert(customers)
    .values({
      prospectId: prospect!.id,
      siteId: site!.id,
      email: `owner${seq}@webhooktest.example`,
      status: 'pending_checkout',
    })
    .returning()
  return { prospect: prospect!, site: site!, customer: customer! }
}

function completedEvent(customerId: string, n: number): StripeWebhookEvent {
  return {
    type: 'checkout.session.completed',
    session: {
      id: `cs_test_${n}`,
      customer: `cus_test_${n}`,
      subscription: `sub_test_${n}`,
      metadata: { customerId, siteId: 'x', claimToken: 'x' },
    },
  }
}

describe('handleStripeEvent — checkout.session.completed', () => {
  it('activates the customer, records the subscription, publishes the site, emails once', async () => {
    const { customer, site, prospect } = await seedPendingCheckout()
    const mailer = new FixtureResendMailer()

    const outcome = await handleStripeEvent(db, mailer, completedEvent(customer.id, 1), OPTS)
    expect(outcome).toMatchObject({ handled: 'checkout.session.completed' })

    const [after] = await db.select().from(customers).where(eq(customers.id, customer.id))
    expect(after!.status).toBe('active')
    expect(after!.stripeCustomerId).toBe('cus_test_1')
    expect(after!.leadAlertEmail).toBe(customer.email)

    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
    expect(subs).toHaveLength(1)
    expect(subs[0]!.stripeSubscriptionId).toBe('sub_test_1')

    const [liveSite] = await db.select().from(sites).where(eq(sites.id, site.id))
    expect(liveSite!.status).toBe('live')
    expect(liveSite!.noindex).toBe(false)
    const [afterProspect] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(afterProspect!.status).toBe('converted')

    expect(mailer.sends).toHaveLength(1)
    expect(mailer.sends[0]!.to).toBe(customer.email)
    expect(mailer.sends[0]!.text).toContain(`/portal/${site.portalToken}`)

    const rows = await db.select().from(events).where(eq(events.siteId, site.id))
    expect(rows.map((e) => e.type)).toEqual(
      expect.arrayContaining(['checkout_completed', 'site_published']),
    )
  })

  it('replay-safe: a duplicate event neither duplicates the subscription nor respams email', async () => {
    const { customer } = await seedPendingCheckout()
    const mailer = new FixtureResendMailer()
    await handleStripeEvent(db, mailer, completedEvent(customer.id, 2), OPTS)
    await handleStripeEvent(db, mailer, completedEvent(customer.id, 2), OPTS)
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
    expect(subs).toHaveLength(1)
    expect(mailer.sends).toHaveLength(1)
  })

  it('falls back to claimToken metadata and ignores orphans with a 200-shaped outcome', async () => {
    const { customer, site } = await seedPendingCheckout()
    const byToken: StripeWebhookEvent = {
      type: 'checkout.session.completed',
      session: {
        id: 'cs_by_token',
        customer: 'cus_by_token',
        subscription: 'sub_by_token',
        metadata: { claimToken: site.claimToken! },
      },
    }
    expect(await handleStripeEvent(db, new FixtureResendMailer(), byToken, OPTS)).toMatchObject({
      handled: 'checkout.session.completed',
    })
    const [after] = await db.select().from(customers).where(eq(customers.id, customer.id))
    expect(after!.status).toBe('active')

    const orphan: StripeWebhookEvent = {
      type: 'checkout.session.completed',
      session: { id: 'cs_orphan', customer: null, subscription: null, metadata: {} },
    }
    expect(await handleStripeEvent(db, new FixtureResendMailer(), orphan, OPTS)).toMatchObject({
      ignored: expect.stringContaining('no matching customer'),
    })
  })
})

describe('handleStripeEvent — subscription lifecycle', () => {
  it('mirrors non-terminal updates without touching the site', async () => {
    const { customer, site } = await seedPendingCheckout()
    await handleStripeEvent(db, new FixtureResendMailer(), completedEvent(customer.id, 3), OPTS)

    const periodEnd = new Date('2026-08-01T00:00:00Z')
    const outcome = await handleStripeEvent(
      db,
      new FixtureResendMailer(),
      {
        type: 'customer.subscription.updated',
        subscription: {
          id: 'sub_test_3',
          customer: 'cus_test_3',
          status: 'past_due',
          priceId: 'price_live_monthly',
          currentPeriodEnd: periodEnd,
          canceledAt: null,
        },
      },
      OPTS,
    )
    expect(outcome).toMatchObject({ handled: 'customer.subscription.updated' })
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, 'sub_test_3'))
    expect(sub!.status).toBe('past_due')
    expect(sub!.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime())
    // past_due is the cron's business — site stays live
    const [after] = await db.select().from(sites).where(eq(sites.id, site.id))
    expect(after!.status).toBe('live')
  })

  it('deletion disables the site and cancels the customer', async () => {
    const { customer, site } = await seedPendingCheckout()
    await handleStripeEvent(db, new FixtureResendMailer(), completedEvent(customer.id, 4), OPTS)

    await handleStripeEvent(
      db,
      new FixtureResendMailer(),
      {
        type: 'customer.subscription.deleted',
        subscription: {
          id: 'sub_test_4',
          customer: 'cus_test_4',
          status: 'canceled',
          priceId: null,
          currentPeriodEnd: null,
          canceledAt: new Date(),
        },
      },
      OPTS,
    )
    const [after] = await db.select().from(sites).where(eq(sites.id, site.id))
    expect(after!.status).toBe('disabled')
    expect(after!.noindex).toBe(true)
    const [afterCustomer] = await db.select().from(customers).where(eq(customers.id, customer.id))
    expect(afterCustomer!.status).toBe('canceled')
  })

  it('unknown subscription and unconsumed event types are ignored', async () => {
    expect(
      await handleStripeEvent(
        db,
        new FixtureResendMailer(),
        {
          type: 'customer.subscription.updated',
          subscription: {
            id: 'sub_never_seen',
            customer: 'cus_x',
            status: 'active',
            priceId: null,
            currentPeriodEnd: null,
            canceledAt: null,
          },
        },
        OPTS,
      ),
    ).toMatchObject({ ignored: 'unknown subscription' })
    expect(
      await handleStripeEvent(db, new FixtureResendMailer(), { type: 'ignored', raw: '{}' }, OPTS),
    ).toMatchObject({ ignored: 'event type not consumed' })
  })
})
