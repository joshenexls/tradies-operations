import { eq } from 'drizzle-orm'
import { customers, events, sites, subscriptions, type Db } from '@tradies/db'
import { EVENT_TYPES, disableSite, publishSite } from '@tradies/engine'
import type { ResendMailer, StripeWebhookEvent } from '@tradies/integrations'
import { tenantOrigin } from '@/lib/stripe'

/**
 * Stripe → platform state, replay-safe. checkout.session.completed is the
 * ONLY automatic path to a live site (publishSite handles noindex/publishedAt
 * /prospect 'converted'); subscription events mirror Stripe verbatim and only
 * lapse a site on terminal statuses. The reconcile cron re-derives the same
 * transitions daily as the safety net.
 */

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired'])

export type StripeWebhookOutcome = { handled: string } | { ignored: string }

export async function handleStripeEvent(
  db: Db,
  mailer: ResendMailer,
  event: StripeWebhookEvent,
  opts: { requestOrigin: string },
): Promise<StripeWebhookOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(db, mailer, event, opts)
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return handleSubscriptionEvent(db, event)
    default:
      return { ignored: 'event type not consumed' }
  }
}

async function handleCheckoutCompleted(
  db: Db,
  mailer: ResendMailer,
  event: Extract<StripeWebhookEvent, { type: 'checkout.session.completed' }>,
  opts: { requestOrigin: string },
): Promise<StripeWebhookOutcome> {
  const { session } = event

  let customer =
    (session.metadata.customerId
      ? (
          await db
            .select()
            .from(customers)
            .where(eq(customers.id, session.metadata.customerId))
            .limit(1)
        )[0]
      : undefined) ?? undefined
  if (!customer && session.metadata.claimToken) {
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.claimToken, session.metadata.claimToken))
      .limit(1)
    if (site) {
      customer = (
        await db.select().from(customers).where(eq(customers.siteId, site.id)).limit(1)
      )[0]
    }
  }
  // 200 to Stripe either way — an orphan session must not retry forever
  if (!customer) return { ignored: 'no matching customer for session metadata' }

  const wasAlreadyActive = customer.status === 'active'
  const now = new Date()
  await db
    .update(customers)
    .set({
      stripeCustomerId: session.customer ?? customer.stripeCustomerId,
      status: 'active',
      leadAlertEmail: customer.leadAlertEmail ?? customer.email,
      updatedAt: now,
    })
    .where(eq(customers.id, customer.id))

  if (session.subscription) {
    // replay-safe: unique stripe_subscription_id, replays just refresh status
    await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        stripeSubscriptionId: session.subscription,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: { status: 'active', updatedAt: now },
      })
  }

  await db.insert(events).values({
    prospectId: customer.prospectId,
    siteId: customer.siteId,
    actor: 'system',
    type: EVENT_TYPES.checkoutCompleted,
    payload: { sessionId: session.id, subscription: session.subscription },
  })

  await publishSite(db, { siteId: customer.siteId, actor: 'system', reason: 'checkout_completed' })

  // welcome email once — replays and re-checkouts must not respam
  if (!wasAlreadyActive && customer.email) {
    const [site] = await db.select().from(sites).where(eq(sites.id, customer.siteId)).limit(1)
    if (site) {
      const origin = tenantOrigin(opts.requestOrigin, site.slug)
      try {
        await mailer.send({
          from:
            process.env.LEAD_ALERT_FROM_EMAIL ?? process.env.INBOX_FROM_EMAIL ?? 'hello@localhost',
          to: customer.email,
          subject: 'Your website is live 🎉',
          text: [
            `Your website is now live at ${origin}`,
            '',
            `Manage leads, request changes and update settings any time:`,
            `${origin}/portal/${site.portalToken}`,
            '',
            `Keep this link private — it is your access to the dashboard.`,
          ].join('\n'),
        })
      } catch (err) {
        // the site IS live; a failed welcome email must not fail the webhook
        console.warn('[stripe-webhook] welcome email failed:', err)
      }
    }
  }

  return { handled: 'checkout.session.completed' }
}

async function handleSubscriptionEvent(
  db: Db,
  event: Extract<
    StripeWebhookEvent,
    { type: 'customer.subscription.updated' | 'customer.subscription.deleted' }
  >,
): Promise<StripeWebhookOutcome> {
  const snapshot = event.subscription
  const status = event.type === 'customer.subscription.deleted' ? 'canceled' : snapshot.status
  const now = new Date()

  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, snapshot.id))
    .limit(1)
  if (!row) return { ignored: 'unknown subscription' }

  await db
    .update(subscriptions)
    .set({
      status,
      priceId: snapshot.priceId ?? row.priceId,
      currentPeriodEnd: snapshot.currentPeriodEnd ?? row.currentPeriodEnd,
      canceledAt: snapshot.canceledAt ?? row.canceledAt,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, row.id))

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1)
  if (!customer) return { handled: event.type }

  await db.insert(events).values({
    prospectId: customer.prospectId,
    siteId: customer.siteId,
    actor: 'system',
    type: EVENT_TYPES.subscriptionUpdated,
    payload: { stripeSubscriptionId: snapshot.id, status },
  })

  // past_due gets BILLING_GRACE_DAYS via the reconcile cron; only terminal
  // statuses take the site down immediately
  if (TERMINAL_SUBSCRIPTION_STATUSES.has(status)) {
    await disableSite(db, {
      siteId: customer.siteId,
      actor: 'system',
      reason: 'subscription_ended',
    })
    await db
      .update(customers)
      .set({ status: 'canceled', updatedAt: now })
      .where(eq(customers.id, customer.id))
  }

  return { handled: event.type }
}
