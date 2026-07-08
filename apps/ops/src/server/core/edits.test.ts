import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { editRequests, events, prospects, sites } from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { declineEditRequest, listEditRequests, markInProgress, resolveEditRequest } from './edits'

/**
 * Edit-request queue mechanics on the real migrations: the list joins through
 * site → prospect, and every resolution (done or declined) writes the
 * edit_request_resolved audit event with the prospect id taken from the site.
 * One PGlite per file; every test seeds its own keyed rows.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

async function seedEditRequest(
  key: string,
  overrides: Partial<typeof editRequests.$inferInsert> = {},
) {
  const [prospect] = await db
    .insert(prospects)
    .values({ placeId: `ChIJedits-${key}`, businessName: `Peak Sparks ${key}`, status: 'claimed' })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({ prospectId: prospect!.id, slug: `peak-sparks-${key}`, status: 'claimed' })
    .returning()
  const [editRequest] = await db
    .insert(editRequests)
    .values({
      siteId: site!.id,
      requestedBy: 'prospect',
      body: `Please change the headline (${key})`,
      status: 'new',
      ...overrides,
    })
    .returning()
  return { prospect: prospect!, site: site!, editRequest: editRequest! }
}

async function resolvedEvents(prospectId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.prospectId, prospectId), eq(events.type, 'edit_request_resolved')))
}

describe('listEditRequests', () => {
  it('joins site + prospect and filters by the given statuses', async () => {
    const openReq = await seedEditRequest('list-new')
    const doneReq = await seedEditRequest('list-done', { status: 'done', resultingSpecVersion: 2 })

    const queue = await listEditRequests(db, ['new', 'in_progress'])
    const queueIds = queue.map((r) => r.editRequest.id)
    expect(queueIds).toContain(openReq.editRequest.id)
    expect(queueIds).not.toContain(doneReq.editRequest.id)

    const row = queue.find((r) => r.editRequest.id === openReq.editRequest.id)
    expect(row?.businessName).toBe('Peak Sparks list-new')
    expect(row?.slug).toBe('peak-sparks-list-new')
    expect(row?.prospectId).toBe(openReq.prospect.id)

    const resolved = await listEditRequests(db, ['done', 'declined'])
    expect(resolved.map((r) => r.editRequest.id)).toContain(doneReq.editRequest.id)
  })

  it('returns nothing for an empty status list', async () => {
    expect(await listEditRequests(db, [])).toEqual([])
  })
})

describe('resolveEditRequest', () => {
  it('marks done with the resulting version and writes the audit event', async () => {
    const { prospect, site, editRequest } = await seedEditRequest('resolve')
    const result = await resolveEditRequest(db, {
      editRequestId: editRequest.id,
      resultingSpecVersion: 3,
    })
    expect(result).toEqual({ ok: true })

    const [after] = await db.select().from(editRequests).where(eq(editRequests.id, editRequest.id))
    expect(after?.status).toBe('done')
    expect(after?.resultingSpecVersion).toBe(3)

    const audit = await resolvedEvents(prospect.id)
    expect(audit).toHaveLength(1)
    expect(audit[0]?.siteId).toBe(site.id)
    expect(audit[0]?.actor).toBe('operator')
    expect(audit[0]?.payload).toMatchObject({
      editRequestId: editRequest.id,
      resultingSpecVersion: 3,
    })
  })

  it('errors on an unknown id', async () => {
    expect(
      await resolveEditRequest(db, { editRequestId: randomUUID(), resultingSpecVersion: 1 }),
    ).toEqual({ error: 'Edit request not found' })
  })
})

describe('declineEditRequest', () => {
  it('marks declined and writes the audit event with declined:true', async () => {
    const { prospect, editRequest } = await seedEditRequest('decline')
    expect(await declineEditRequest(db, editRequest.id)).toEqual({ ok: true })

    const [after] = await db.select().from(editRequests).where(eq(editRequests.id, editRequest.id))
    expect(after?.status).toBe('declined')
    expect(after?.resultingSpecVersion).toBeNull()

    const audit = await resolvedEvents(prospect.id)
    expect(audit).toHaveLength(1)
    expect(audit[0]?.payload).toMatchObject({ editRequestId: editRequest.id, declined: true })
  })

  it('errors on an unknown id', async () => {
    expect(await declineEditRequest(db, randomUUID())).toEqual({
      error: 'Edit request not found',
    })
  })
})

describe('markInProgress', () => {
  it('flips a new request to in_progress without writing an event', async () => {
    const { prospect, editRequest } = await seedEditRequest('progress')
    expect(await markInProgress(db, editRequest.id)).toEqual({ ok: true })
    const [after] = await db.select().from(editRequests).where(eq(editRequests.id, editRequest.id))
    expect(after?.status).toBe('in_progress')
    expect(await resolvedEvents(prospect.id)).toHaveLength(0)
  })
})
