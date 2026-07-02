import { eq } from 'drizzle-orm'
import type { Db } from '@tradies/db'
import { events, prospects } from '@tradies/db/schema'
import type { EntityType } from '@tradies/compliance'
import { EVENT_TYPES } from '@tradies/engine'

/**
 * THE compliance-critical write: records the operator's PECR subscriber-type
 * decision. Cold email is gated on entityType='corporate' AND a fresh
 * entityCheckedAt (see @tradies/compliance assertColdEmailAllowed and the
 * outreach_messages DB CHECK) — so this function always stamps checkedAt and
 * always leaves an audit event. Pure (db injected) so vitest exercises it
 * without the Next runtime; the 'use server' wrapper lives in ../actions.
 */
export async function classifyEntityCore(
  db: Db,
  input: {
    prospectId: string
    entityType: EntityType
    note?: string
    companiesHouseNumber?: string
  },
): Promise<void> {
  const [updated] = await db
    .update(prospects)
    .set({
      entityType: input.entityType,
      entityCheckedAt: new Date(),
      ...(input.companiesHouseNumber ? { companiesHouseNumber: input.companiesHouseNumber } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, input.prospectId))
    .returning()
  if (!updated) throw new Error(`prospect ${input.prospectId} not found`)

  await db.insert(events).values({
    prospectId: input.prospectId,
    actor: 'operator',
    type: EVENT_TYPES.entityClassified,
    payload: {
      entityType: input.entityType,
      note: input.note ?? null,
      companiesHouseNumber: input.companiesHouseNumber ?? null,
    },
  })
}
