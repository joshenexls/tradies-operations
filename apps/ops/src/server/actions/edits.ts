'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { editRequests, sites } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { declineEditRequest, markInProgress, resolveEditRequest } from '../core/edits'
import { generateForProspect } from './generation'

export type EditActionResult = { ok: true; version?: number } | { error: string }

/**
 * Turn an edit request into a new site version: mark it in_progress, run the
 * existing generation action with the request body as feedback, and resolve
 * with the version that shipped. A failed generation puts the request back to
 * 'new' so it stays in the queue.
 */
export async function regenerateFromEditRequest(editRequestId: string): Promise<EditActionResult> {
  const db = getDb()
  const [row] = await db
    .select({ editRequest: editRequests, prospectId: sites.prospectId })
    .from(editRequests)
    .innerJoin(sites, eq(editRequests.siteId, sites.id))
    .where(eq(editRequests.id, editRequestId))
    .limit(1)
  if (!row) return { error: 'Edit request not found' }
  if (row.editRequest.status === 'done' || row.editRequest.status === 'declined') {
    return { error: 'Edit request is already resolved' }
  }

  await markInProgress(db, editRequestId)
  const result = await generateForProspect(row.prospectId, {
    feedback: row.editRequest.body ?? undefined,
  })
  if ('error' in result) {
    await db
      .update(editRequests)
      .set({ status: 'new', updatedAt: new Date() })
      .where(eq(editRequests.id, editRequestId))
    revalidatePath('/edits')
    return { error: result.error }
  }

  await resolveEditRequest(db, { editRequestId, resultingSpecVersion: result.version })
  revalidatePath('/edits')
  return { ok: true, version: result.version }
}

export async function declineEditRequestAction(editRequestId: string): Promise<EditActionResult> {
  const result = await declineEditRequest(getDb(), editRequestId)
  revalidatePath('/edits')
  return result
}
