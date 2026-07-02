import { desc, eq, inArray } from 'drizzle-orm'
import type { Db, EditRequestRow } from '@tradies/db'
import { editRequests, events, prospects, sites } from '@tradies/db/schema'
import { EVENT_TYPES } from '@tradies/engine'

/**
 * Edit-request queue mechanics: prospects/customers file change requests from
 * the tenant site, the operator regenerates (or declines) from /edits. Pure
 * db-in/rows-out; the 'use server' wrappers live in ../actions/edits.ts.
 */

export type EditRequestListRow = {
  editRequest: EditRequestRow
  prospectId: string
  businessName: string | null
  slug: string
}

export type EditRequestActionResult = { ok: true } | { error: string }

export async function listEditRequests(
  db: Db,
  statuses: EditRequestRow['status'][],
): Promise<EditRequestListRow[]> {
  if (statuses.length === 0) return []
  return db
    .select({
      editRequest: editRequests,
      prospectId: sites.prospectId,
      businessName: prospects.businessName,
      slug: sites.slug,
    })
    .from(editRequests)
    .innerJoin(sites, eq(editRequests.siteId, sites.id))
    .innerJoin(prospects, eq(sites.prospectId, prospects.id))
    .where(inArray(editRequests.status, statuses))
    .orderBy(desc(editRequests.updatedAt))
}

async function loadRequest(db: Db, editRequestId: string) {
  const [row] = await db
    .select({ editRequest: editRequests, prospectId: sites.prospectId })
    .from(editRequests)
    .innerJoin(sites, eq(editRequests.siteId, sites.id))
    .where(eq(editRequests.id, editRequestId))
    .limit(1)
  return row
}

/** A regeneration shipped: done + the spec version it produced, with the audit event. */
export async function resolveEditRequest(
  db: Db,
  input: { editRequestId: string; resultingSpecVersion: number },
): Promise<EditRequestActionResult> {
  const row = await loadRequest(db, input.editRequestId)
  if (!row) return { error: 'Edit request not found' }
  await db
    .update(editRequests)
    .set({
      status: 'done',
      resultingSpecVersion: input.resultingSpecVersion,
      updatedAt: new Date(),
    })
    .where(eq(editRequests.id, input.editRequestId))
  await db.insert(events).values({
    prospectId: row.prospectId,
    siteId: row.editRequest.siteId,
    actor: 'operator',
    type: EVENT_TYPES.editRequestResolved,
    payload: {
      editRequestId: input.editRequestId,
      resultingSpecVersion: input.resultingSpecVersion,
    },
  })
  return { ok: true }
}

/** The operator turned the request down — resolved, but nothing shipped. */
export async function declineEditRequest(
  db: Db,
  editRequestId: string,
): Promise<EditRequestActionResult> {
  const row = await loadRequest(db, editRequestId)
  if (!row) return { error: 'Edit request not found' }
  await db
    .update(editRequests)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(eq(editRequests.id, editRequestId))
  await db.insert(events).values({
    prospectId: row.prospectId,
    siteId: row.editRequest.siteId,
    actor: 'operator',
    type: EVENT_TYPES.editRequestResolved,
    payload: { editRequestId, declined: true },
  })
  return { ok: true }
}

export async function markInProgress(
  db: Db,
  editRequestId: string,
): Promise<EditRequestActionResult> {
  const row = await loadRequest(db, editRequestId)
  if (!row) return { error: 'Edit request not found' }
  await db
    .update(editRequests)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(eq(editRequests.id, editRequestId))
  return { ok: true }
}
