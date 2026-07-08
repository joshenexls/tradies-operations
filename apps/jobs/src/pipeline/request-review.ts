import { eq } from 'drizzle-orm'
import { events, prospects, reviewBatches, reviewRequests, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'

/**
 * The human gate. autoApprove batches complete instantly (operator opted in
 * per batch); everything else waits for the ops-desk decision — in Trigger
 * runs, the task wrapper parks on a wait token whose id is stored on the
 * request so decideReview can complete it.
 */
export async function requestReview(
  db: Db,
  input: {
    prospectId: string
    batchId?: string
    batchLabel?: string
    city?: string
    autoApprove?: boolean
    waitpointToken?: string
  },
): Promise<{ batchId: string; requestId: string; autoApproved: boolean }> {
  let batchId = input.batchId
  if (!batchId) {
    const [batch] = await db
      .insert(reviewBatches)
      .values({
        label: input.batchLabel ?? `Discovery ${new Date().toISOString().slice(0, 10)}`,
        city: input.city ?? null,
        status: 'open',
        autoApprove: input.autoApprove ?? false,
      })
      .returning({ id: reviewBatches.id })
    batchId = batch!.id
  }
  const [batchRow] = await db
    .select()
    .from(reviewBatches)
    .where(eq(reviewBatches.id, batchId))
    .limit(1)
  const autoApprove = batchRow?.autoApprove ?? false

  const [request] = await db
    .insert(reviewRequests)
    .values({
      batchId,
      prospectId: input.prospectId,
      kind: 'site',
      status: autoApprove ? 'approved' : 'pending',
      waitpointToken: input.waitpointToken ?? null,
      decidedBy: autoApprove ? 'auto' : null,
      decidedAt: autoApprove ? new Date() : null,
    })
    .returning({ id: reviewRequests.id })

  if (autoApprove) {
    await db.update(prospects).set({ status: 'approved' }).where(eq(prospects.id, input.prospectId))
    await db.insert(events).values({
      prospectId: input.prospectId,
      actor: 'system',
      type: EVENT_TYPES.reviewDecided,
      payload: { decision: 'approved', decidedBy: 'auto', batchId },
    })
  }
  return { batchId, requestId: request!.id, autoApproved: autoApprove }
}
