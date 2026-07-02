import { and, eq, lt } from 'drizzle-orm'
import { events, prospects, sites, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'

/** Daily cron: previews past their TTL disappear (compliance guardrail #7). */
export async function expirePreviews(db: Db, now: Date = new Date()): Promise<{ expired: number }> {
  const stale = await db
    .select({ id: sites.id, prospectId: sites.prospectId, slug: sites.slug })
    .from(sites)
    .where(and(eq(sites.status, 'preview'), lt(sites.previewExpiresAt, now)))

  for (const site of stale) {
    await db.update(sites).set({ status: 'expired' }).where(eq(sites.id, site.id))
    await db.update(prospects).set({ status: 'expired' }).where(eq(prospects.id, site.prospectId))
    await db.insert(events).values({
      prospectId: site.prospectId,
      siteId: site.id,
      actor: 'system',
      type: EVENT_TYPES.previewExpired,
      payload: { slug: site.slug },
    })
  }
  return { expired: stale.length }
}
