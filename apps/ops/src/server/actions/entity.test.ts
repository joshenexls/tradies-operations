import { desc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ComplianceError, assertColdEmailAllowed } from '@tradies/compliance'
import { events, outreachCampaigns, outreachMessages, prospects } from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { EVENT_TYPES } from '@tradies/engine'
import { classifyEntityCore } from '../core/entity'

/**
 * The compliance-critical path: the operator's classification must (a) be
 * persisted with a fresh check timestamp, (b) leave an audit event, and
 * (c) drive both gates — the code gate (assertColdEmailAllowed) and the
 * Postgres CHECK on outreach_messages that survives any application bug.
 */

let db: TestDb
let campaignId: string

beforeAll(async () => {
  db = await createTestDb()
  const [campaign] = await db
    .insert(outreachCampaigns)
    .values({ name: 'gate-test', channel: 'email_cold' })
    .returning()
  if (!campaign) throw new Error('campaign insert failed')
  campaignId = campaign.id
})

afterAll(async () => {
  await db.$client.close()
})

async function makeProspect(placeId: string) {
  const [row] = await db
    .insert(prospects)
    .values({ placeId, businessName: 'Gate Test Ltd' })
    .returning()
  if (!row) throw new Error('prospect insert failed')
  return row
}

function gateError(input: Parameters<typeof assertColdEmailAllowed>[0]): ComplianceError | null {
  try {
    assertColdEmailAllowed(input)
    return null
  } catch (err) {
    if (err instanceof ComplianceError) return err
    throw err
  }
}

// drizzle may wrap driver errors — match against the error chain
async function expectDbRejection(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err, 'expected the statement to be rejected').not.toBeNull()
  expect(`${String(err)} ${String((err as Error).cause ?? '')}`).toMatch(pattern)
}

describe('classifyEntityCore', () => {
  it('individual: persists, audits, and both gates refuse cold email', async () => {
    const prospect = await makeProspect('ChIJentity-individual')
    await classifyEntityCore(db, {
      prospectId: prospect.id,
      entityType: 'individual',
      note: 'sole trader per their own site footer',
    })

    const [updated] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(updated?.entityType).toBe('individual')
    expect(updated?.entityCheckedAt).toBeInstanceOf(Date)

    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.prospectId, prospect.id))
      .orderBy(desc(events.createdAt))
      .limit(1)
    expect(event?.type).toBe(EVENT_TYPES.entityClassified)
    expect(event?.actor).toBe('operator')
    expect(event?.payload).toMatchObject({
      entityType: 'individual',
      note: 'sole trader per their own site footer',
    })

    const gate = gateError({
      entityType: updated!.entityType,
      entityCheckedAt: updated!.entityCheckedAt,
    })
    expect(gate?.code).toBe('not_corporate')

    // the DB CHECK is the last line of defence — raw insert must bounce
    await expectDbRejection(
      db.insert(outreachMessages).values({
        prospectId: prospect.id,
        campaignId,
        channel: 'email_cold',
        entityTypeAtQueue: 'individual',
      }),
      /check constraint.*outreach_messages_pecr_cold_email_corporate_only/,
    )
  })

  it('unknown: treated as individual until verified (entity_unknown)', async () => {
    const prospect = await makeProspect('ChIJentity-unknown')
    await classifyEntityCore(db, { prospectId: prospect.id, entityType: 'unknown' })

    const [updated] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(updated?.entityType).toBe('unknown')
    const gate = gateError({
      entityType: updated!.entityType,
      entityCheckedAt: updated!.entityCheckedAt,
    })
    expect(gate?.code).toBe('entity_unknown')
  })

  it('corporate: gate passes and the cold-email insert is accepted', async () => {
    const prospect = await makeProspect('ChIJentity-corporate')
    await classifyEntityCore(db, {
      prospectId: prospect.id,
      entityType: 'corporate',
      note: 'CH 08214563 active',
      companiesHouseNumber: '08214563',
    })

    const [updated] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(updated?.entityType).toBe('corporate')
    expect(updated?.companiesHouseNumber).toBe('08214563')
    expect(
      gateError({ entityType: updated!.entityType, entityCheckedAt: updated!.entityCheckedAt }),
    ).toBeNull()

    const [message] = await db
      .insert(outreachMessages)
      .values({
        prospectId: prospect.id,
        campaignId,
        channel: 'email_cold',
        entityTypeAtQueue: 'corporate',
        legalBasis: 'legitimate_interest_corporate',
      })
      .returning()
    expect(message?.status).toBe('queued')
  })

  it('throws for a missing prospect', async () => {
    await expect(
      classifyEntityCore(db, {
        prospectId: '00000000-0000-0000-0000-000000000000',
        entityType: 'corporate',
      }),
    ).rejects.toThrow(/not found/)
  })
})
