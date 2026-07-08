import { and, count, countDistinct, desc, eq, inArray, max } from 'drizzle-orm'
import { events, previewVisits, sites } from '@tradies/db/schema'
import { EVENT_TYPES } from '@tradies/engine'
import type { getDb } from './db'

type Db = ReturnType<typeof getDb>

/** Note from the most recent entity_classified audit event, if any. */
export async function latestEntityNote(db: Db, prospectId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.prospectId, prospectId), eq(events.type, EVENT_TYPES.entityClassified)))
    .orderBy(desc(events.createdAt))
    .limit(1)
  const payload = row?.payload as { note?: string | null } | undefined
  return payload?.note ?? null
}

export type PreviewEngagement = {
  visits: number
  /** Distinct hashed IPs — "devices" is honest shorthand, not identity. */
  devices: number
  lastVisitAt: Date | null
}

/**
 * Buying-signal counts per prospect from preview_visits, EXCLUDING operator
 * visits (?op=1 links from this desk) so the numbers only reflect the
 * prospect opening their own preview.
 */
export async function previewEngagement(
  db: Db,
  prospectIds: string[],
): Promise<Map<string, PreviewEngagement>> {
  if (prospectIds.length === 0) return new Map()
  const rows = await db
    .select({
      prospectId: sites.prospectId,
      visits: count(previewVisits.id),
      devices: countDistinct(previewVisits.ipHash),
      lastVisitAt: max(previewVisits.visitedAt),
    })
    .from(previewVisits)
    .innerJoin(sites, eq(previewVisits.siteId, sites.id))
    .where(and(eq(previewVisits.isOperator, false), inArray(sites.prospectId, prospectIds)))
    .groupBy(sites.prospectId)
  return new Map(
    rows.map((r) => [
      r.prospectId,
      { visits: Number(r.visits), devices: Number(r.devices), lastVisitAt: r.lastVisitAt },
    ]),
  )
}
