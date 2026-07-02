import { eq } from 'drizzle-orm'
import { events, prospects, suppressionList, type Db } from '@tradies/db'
import {
  assertColdEmailAllowed,
  checkSuppression,
  ComplianceError,
  type SuppressionEntry,
} from '@tradies/compliance'
import { EVENT_TYPES } from '@tradies/engine'

/**
 * Outreach dispatch STUB (real Smartlead lands in Phase 5). The gates are the
 * real thing though — a prospect the operator has not marked corporate can
 * never reach a cold-email queue, dry run or not. Gate failures don't throw:
 * they record why and leave the prospect awaiting operator classification.
 */
export async function dispatchOutreach(
  db: Db,
  input: { prospectId: string; dryRun?: boolean },
): Promise<{ dispatched: boolean; blockedReason?: string }> {
  const dryRun = input.dryRun ?? process.env.OUTREACH_DRY_RUN !== '0'
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1)
  if (!prospect) throw new Error(`unknown prospect ${input.prospectId}`)

  const entries = (await db.select().from(suppressionList)) as SuppressionEntry[]
  const suppression = checkSuppression(entries, {
    phone: prospect.phone ?? undefined,
    placeId: prospect.placeId ?? undefined,
  })

  try {
    if (suppression.suppressed) {
      throw new ComplianceError('suppressed', 'prospect matches the global suppression list')
    }
    assertColdEmailAllowed({
      entityType: prospect.entityType,
      entityCheckedAt: prospect.entityCheckedAt,
    })
  } catch (err) {
    const code = err instanceof ComplianceError ? err.code : 'unknown'
    await db.insert(events).values({
      prospectId: prospect.id,
      actor: 'system',
      type: EVENT_TYPES.outreachBlocked,
      payload: { code, dryRun },
    })
    return { dispatched: false, blockedReason: code }
  }

  // Gates passed. Phase 5 pushes to Smartlead here; until then dry-run only —
  // deliberately NO outreach_messages row is written by the stub.
  await db.insert(events).values({
    prospectId: prospect.id,
    actor: 'system',
    type: EVENT_TYPES.outreachDryRun,
    payload: { dryRun, entityType: prospect.entityType },
  })
  return { dispatched: false }
}
