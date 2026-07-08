import { eq } from 'drizzle-orm'
import { customers, sites, subscriptions, type Db } from '@tradies/db'
import { disableSite, publishSite } from '@tradies/engine'
import type { StripeClient } from '@tradies/integrations'

/**
 * Daily billing reconcile — the safety net behind the Stripe webhooks. Every
 * subscription is re-fetched from Stripe, mirrored into its row, and the same
 * lapse/recovery transitions the webhook derives are re-derived here so a
 * missed webhook can never leave a site permanently out of sync:
 *
 *   - terminal status (canceled/unpaid/incomplete_expired), or past_due with
 *     the grace window exhausted → disableSite + customer 'canceled'
 *   - healthy status (active/trialing) on a disabled site → publishSite +
 *     customer 'active' — unless the customer was GDPR-erased, which is final
 *
 * State transitions go through the engine lifecycle (which writes the events
 * rows); the subscription mirror itself is silent.
 */

const LAPSED_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired'])
const HEALTHY_STATUSES = new Set(['active', 'trialing'])
const DAY_MS = 24 * 60 * 60 * 1000

export async function reconcileSubscriptions(
  db: Db,
  stripe: StripeClient,
  opts: { now?: Date; graceDays?: number } = {},
): Promise<{ checked: number; disabled: number; republished: number }> {
  const now = opts.now ?? new Date()
  const graceDays = opts.graceDays ?? Number(process.env.BILLING_GRACE_DAYS ?? 7)

  const rows = await db
    .select({ subscription: subscriptions, customer: customers, site: sites })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(sites, eq(customers.siteId, sites.id))

  let checked = 0
  let disabled = 0
  let republished = 0

  for (const { subscription, customer, site } of rows) {
    // pending_checkout rows have no Stripe id yet — nothing to reconcile
    if (!subscription.stripeSubscriptionId) continue
    checked++
    try {
      const snapshot = await stripe.getSubscription(subscription.stripeSubscriptionId)

      // Mirror Stripe verbatim (same null-keeps-existing rule as the webhook).
      const periodEnd = snapshot.currentPeriodEnd ?? subscription.currentPeriodEnd
      const canceledAt = snapshot.canceledAt ?? subscription.canceledAt
      const priceId = snapshot.priceId ?? subscription.priceId
      const changed =
        snapshot.status !== subscription.status ||
        priceId !== subscription.priceId ||
        periodEnd?.getTime() !== subscription.currentPeriodEnd?.getTime() ||
        canceledAt?.getTime() !== subscription.canceledAt?.getTime()
      if (changed) {
        await db
          .update(subscriptions)
          .set({
            status: snapshot.status,
            priceId,
            currentPeriodEnd: periodEnd,
            canceledAt,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, subscription.id))
      }

      const graceExhausted =
        snapshot.status === 'past_due' &&
        periodEnd !== null &&
        now.getTime() > periodEnd.getTime() + graceDays * DAY_MS

      if (LAPSED_STATUSES.has(snapshot.status) || graceExhausted) {
        if (site.status !== 'disabled') {
          await disableSite(db, {
            siteId: site.id,
            actor: 'system',
            reason: 'subscription_lapsed',
          })
          await db
            .update(customers)
            .set({ status: 'canceled', updatedAt: now })
            .where(eq(customers.id, customer.id))
          disabled++
        }
      } else if (
        HEALTHY_STATUSES.has(snapshot.status) &&
        site.status === 'disabled' &&
        customer.status !== 'erased' // erasure is final — payment cannot resurrect the site
      ) {
        await publishSite(db, {
          siteId: site.id,
          actor: 'system',
          reason: 'subscription_recovered',
        })
        await db
          .update(customers)
          .set({ status: 'active', updatedAt: now })
          .where(eq(customers.id, customer.id))
        republished++
      }
    } catch (err) {
      // one broken subscription must not abort the whole sweep
      console.warn(
        `[reconcile-subscriptions] failed for ${subscription.stripeSubscriptionId}:`,
        err,
      )
    }
  }

  return { checked, disabled, republished }
}
