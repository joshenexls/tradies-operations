import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  inboxMessages,
  inboxThreads,
  outreachCampaigns,
  outreachMessages,
  permissionEvents,
  prospects,
  suppressionList,
} from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { handleSmartleadEvent } from './outreach-webhooks'

/**
 * The webhook side of the outreach loop: replies open inbox threads, bounces
 * and unsubscribes suppress the prospect everywhere. All against the real
 * migrations on PGlite (one instance per file; every test seeds its own
 * prospect/lead so assertions can be scoped).
 */

let db: TestDb
let campaignId: string

beforeAll(async () => {
  db = await createTestDb()
  const [campaign] = await db
    .insert(outreachCampaigns)
    .values({ name: 'plumber Leeds', channel: 'email_cold' })
    .returning()
  campaignId = campaign!.id
}, 60_000)

async function seedOutreach(key: string) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      placeId: `ChIJwebhook-${key}`,
      businessName: 'Swift Flow Plumbing',
      phone: '0113 496 0721',
      city: 'Leeds',
      trade: 'plumber',
      entityType: 'corporate',
      entityCheckedAt: new Date(),
      status: 'contacted',
      extractedProfile: { email: { value: `info@${key}.example`, source: 'own_website' } },
    })
    .returning()
  const [message] = await db
    .insert(outreachMessages)
    .values({
      prospectId: prospect!.id,
      campaignId,
      channel: 'email_cold',
      subject: 'A new website for Swift Flow Plumbing',
      body: 'pitch body',
      legalBasis: 'legitimate_interest_corporate',
      entityTypeAtQueue: 'corporate',
      status: 'approved',
      smartleadLeadId: `sl-lead-${key}`,
    })
    .returning()
  return { prospect: prospect!, message: message! }
}

describe('handleSmartleadEvent', () => {
  it('reply: flips the message + prospect and opens a needs_reply thread', async () => {
    const { prospect, message } = await seedOutreach('reply')
    const result = await handleSmartleadEvent(db, {
      kind: 'reply',
      leadId: 'sl-lead-reply',
      email: 'info@reply.example',
      campaignId: '12345',
    })
    expect(result.handled).toBe(true)
    expect(result.prospectId).toBe(prospect.id)

    const [updatedMessage] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, message.id))
    expect(updatedMessage?.status).toBe('replied')

    const [thread] = await db
      .select()
      .from(inboxThreads)
      .where(eq(inboxThreads.prospectId, prospect.id))
    expect(thread?.status).toBe('needs_reply')
    expect(thread?.channel).toBe('email')
    expect(thread?.subject).toBe('A new website for Swift Flow Plumbing')

    const messages = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.threadId, thread!.id))
    expect(messages).toHaveLength(1)
    expect(messages[0]?.direction).toBe('inbound')

    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(after?.status).toBe('replied')
  })

  it('bounce: suppresses email + domain, records the permission event, suppresses the prospect', async () => {
    const { prospect, message } = await seedOutreach('bounce')
    await handleSmartleadEvent(db, {
      kind: 'bounce',
      leadId: 'sl-lead-bounce',
      email: 'info@bounce.example',
    })

    const [updatedMessage] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, message.id))
    expect(updatedMessage?.status).toBe('bounced')

    const entries = await db
      .select()
      .from(suppressionList)
      .where(eq(suppressionList.prospectId, prospect.id))
    const byKind = Object.fromEntries(entries.map((e) => [e.kind, e.value]))
    expect(byKind).toEqual({ email: 'info@bounce.example', domain: 'bounce.example' })
    expect(entries.every((e) => e.reason === 'bounce')).toBe(true)

    const permissions = await db
      .select()
      .from(permissionEvents)
      .where(eq(permissionEvents.prospectId, prospect.id))
    expect(permissions.map((p) => p.kind)).toContain('unsubscribed')

    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(after?.status).toBe('suppressed')
    expect(after?.suppressedAt).toBeInstanceOf(Date)
  })

  it('unsubscribe: suppresses with the unsubscribe reason', async () => {
    const { prospect } = await seedOutreach('unsub')
    await handleSmartleadEvent(db, {
      kind: 'unsubscribe',
      leadId: 'sl-lead-unsub',
      email: 'info@unsub.example',
    })
    const entries = await db
      .select()
      .from(suppressionList)
      .where(eq(suppressionList.prospectId, prospect.id))
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.reason === 'unsubscribe')).toBe(true)
  })

  it('sent: stamps sentAt and moves the status forward', async () => {
    const { message } = await seedOutreach('sent')
    await handleSmartleadEvent(db, { kind: 'sent', leadId: 'sl-lead-sent' })
    const [updated] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, message.id))
    expect(updated?.status).toBe('sent')
    expect(updated?.sentAt).toBeInstanceOf(Date)
  })

  it('unknown lead ids are recorded and ignored, never thrown', async () => {
    const { prospect, message } = await seedOutreach('unknown')
    const result = await handleSmartleadEvent(db, { kind: 'open', leadId: 'sl-lead-nope' })
    expect(result.handled).toBe(false)
    expect(
      await db.select().from(inboxThreads).where(eq(inboxThreads.prospectId, prospect.id)),
    ).toHaveLength(0)
    const [untouched] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, message.id))
    expect(untouched?.status).toBe('approved')
  })
})
