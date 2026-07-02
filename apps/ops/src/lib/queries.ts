import { and, desc, eq } from 'drizzle-orm'
import { events } from '@tradies/db/schema'
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
