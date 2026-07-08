import { eq } from 'drizzle-orm'
import { events, prospects, sites, type Db } from '@tradies/db'
import { EVENT_TYPES } from './events'

/**
 * THE go-live state machine — the Stripe webhook, the ops desk overrides and
 * the billing reconcile cron all call these three functions so a site's
 * status/noindex/publishedAt can never drift between callers. Every
 * transition writes an events row.
 *
 *   preview ──(payment)──▶ live ◀──(recovered)── disabled
 *                    │  ▲                    ▲
 *      (ops unpublish)  │(ops publish)       │(delinquency, erasure)
 *                    ▼  │                    │
 *                   claimed ─────────────────┘
 */

export type LifecycleActor = 'system' | 'operator'

async function loadSite(db: Db, siteId: string) {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)
  if (!site) throw new Error(`unknown site ${siteId}`)
  return site
}

/**
 * Payment landed (or ops override): the site goes public. noindex off is the
 * single most consequential flip in the platform — it is only reachable here.
 */
export async function publishSite(
  db: Db,
  input: { siteId: string; actor: LifecycleActor; reason?: string },
): Promise<void> {
  const site = await loadSite(db, input.siteId)
  await db
    .update(sites)
    .set({
      status: 'live',
      noindex: false,
      publishedAt: site.publishedAt ?? new Date(),
      previewExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, site.id))
  await db
    .update(prospects)
    .set({ status: 'converted', updatedAt: new Date() })
    .where(eq(prospects.id, site.prospectId))
  await db.insert(events).values({
    prospectId: site.prospectId,
    siteId: site.id,
    actor: input.actor,
    type: EVENT_TYPES.sitePublished,
    payload: { slug: site.slug, reason: input.reason ?? null, previousStatus: site.status },
  })
}

/**
 * Ops pulls a paying customer's site out of search/public view without
 * touching billing — status 'claimed' keeps the portal working.
 */
export async function unpublishSite(
  db: Db,
  input: { siteId: string; actor: LifecycleActor; reason?: string },
): Promise<void> {
  const site = await loadSite(db, input.siteId)
  await db
    .update(sites)
    .set({ status: 'claimed', noindex: true, updatedAt: new Date() })
    .where(eq(sites.id, site.id))
  await db.insert(events).values({
    prospectId: site.prospectId,
    siteId: site.id,
    actor: input.actor,
    type: EVENT_TYPES.siteUnpublished,
    payload: { slug: site.slug, reason: input.reason ?? null, previousStatus: site.status },
  })
}

/**
 * Terminal-ish: delinquent subscription, cancellation or erasure. The tenant
 * page 404s for 'disabled', so this takes the site fully offline.
 */
export async function disableSite(
  db: Db,
  input: { siteId: string; actor: LifecycleActor; reason: string },
): Promise<void> {
  const site = await loadSite(db, input.siteId)
  await db
    .update(sites)
    .set({ status: 'disabled', noindex: true, updatedAt: new Date() })
    .where(eq(sites.id, site.id))
  await db.insert(events).values({
    prospectId: site.prospectId,
    siteId: site.id,
    actor: input.actor,
    type: EVENT_TYPES.siteDisabled,
    payload: { slug: site.slug, reason: input.reason, previousStatus: site.status },
  })
}
