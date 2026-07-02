import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { inboxMessages, inboxThreads, prospects, suppressionList } from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { FixtureResendMailer } from '@tradies/integrations'
import { handleInboundEmail } from './inbound-mail'
import { closeThreadCore, sendReplyCore, suppressAndCloseThreadCore } from './inbox'

/**
 * Inbox mechanics on the real migrations: operator replies go out through the
 * mailer and come back as outbound rows; inbound mail files into threads with
 * a raw-payload pointer; opt-out language suppresses. One PGlite per file;
 * every test seeds its own prospect + thread.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

async function seedThread(key: string) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      placeId: `ChIJinbox-${key}`,
      businessName: 'Swift Flow Plumbing',
      phone: '0113 496 0721',
      status: 'replied',
      extractedProfile: { email: { value: `info@${key}.example`, source: 'own_website' } },
    })
    .returning()
  const [thread] = await db
    .insert(inboxThreads)
    .values({
      prospectId: prospect!.id,
      channel: 'email',
      subject: 'A new website for Swift Flow Plumbing',
      status: 'needs_reply',
      lastMessageAt: new Date(),
    })
    .returning()
  return { prospect: prospect!, thread: thread! }
}

describe('sendReplyCore', () => {
  it('sends via the mailer, writes the outbound row, and re-opens the thread', async () => {
    const { thread } = await seedThread('send')
    const mailer = new FixtureResendMailer()
    const result = await sendReplyCore(db, mailer, {
      threadId: thread.id,
      body: 'Thanks — you can claim the site from the preview banner.',
      from: 'Tradies Studio <studio@mail.example>',
    })
    expect(result).toMatchObject({ ok: true })

    expect(mailer.sends).toHaveLength(1)
    expect(mailer.sends[0]).toMatchObject({
      to: 'info@send.example',
      subject: 'Re: A new website for Swift Flow Plumbing',
    })

    const rows = await db.select().from(inboxMessages).where(eq(inboxMessages.threadId, thread.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.direction).toBe('outbound')
    expect(rows[0]?.toAddr).toBe('info@send.example')
    expect(rows[0]?.providerId).toBe('re-msg-1')

    const [after] = await db.select().from(inboxThreads).where(eq(inboxThreads.id, thread.id))
    expect(after?.status).toBe('open')
  })

  it('refuses to reply to a suppressed prospect', async () => {
    const { prospect, thread } = await seedThread('suppressed')
    await db
      .update(prospects)
      .set({ status: 'suppressed', suppressedAt: new Date() })
      .where(eq(prospects.id, prospect.id))
    const result = await sendReplyCore(db, new FixtureResendMailer(), {
      threadId: thread.id,
      body: 'hello',
    })
    expect(result).toMatchObject({ error: expect.stringContaining('suppressed') })
    expect(
      await db.select().from(inboxMessages).where(eq(inboxMessages.threadId, thread.id)),
    ).toHaveLength(0)
  })
})

describe('thread closing', () => {
  it('close just closes', async () => {
    const { prospect, thread } = await seedThread('close')
    expect(await closeThreadCore(db, thread.id)).toEqual({ ok: true })
    const [after] = await db.select().from(inboxThreads).where(eq(inboxThreads.id, thread.id))
    expect(after?.status).toBe('closed')
    const [prospectAfter] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(prospectAfter?.status).toBe('replied') // untouched
  })

  it('suppress & close suppresses every identifier and closes', async () => {
    const { prospect, thread } = await seedThread('supclose')
    expect(await suppressAndCloseThreadCore(db, thread.id)).toEqual({ ok: true })
    const [after] = await db.select().from(inboxThreads).where(eq(inboxThreads.id, thread.id))
    expect(after?.status).toBe('closed')
    const kinds = (
      await db.select().from(suppressionList).where(eq(suppressionList.prospectId, prospect.id))
    )
      .map((e) => e.kind)
      .sort()
    expect(kinds).toEqual(['domain', 'email', 'phone', 'place_id'])
    const [prospectAfter] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(prospectAfter?.status).toBe('suppressed')
  })
})

describe('handleInboundEmail', () => {
  it('files the reply into a thread and stores only a pointer to the raw payload', async () => {
    const { prospect, thread } = await seedThread('inbound')
    const rawDir = await mkdtemp(path.join(os.tmpdir(), 'raw-mail-'))
    const rawJson = JSON.stringify({ type: 'email.received' })
    const result = await handleInboundEmail(
      db,
      {
        toPlusToken: `prospect-${prospect.id}`,
        from: 'Sam Waters <sam@inbound.example>',
        subject: 'Re: A new website for Swift Flow Plumbing',
        text: 'This looks great — how do I claim it?',
      },
      { rawJson, rawDir },
    )
    expect(result.matched).toBe(true)
    expect(result.suppressed).toBe(false)
    expect(result.threadId).toBe(thread.id) // reuses the prospect's email thread

    const rows = await db.select().from(inboxMessages).where(eq(inboxMessages.threadId, thread.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.bodyText).toBe('This looks great — how do I claim it?')
    expect(rows[0]?.rawRef).toBeTruthy()
    expect(await readFile(rows[0]!.rawRef!, 'utf8')).toBe(rawJson)
  })

  it('auto-suppresses on STOP/unsubscribe language', async () => {
    const { prospect } = await seedThread('stop')
    const rawDir = await mkdtemp(path.join(os.tmpdir(), 'raw-mail-'))
    const result = await handleInboundEmail(
      db,
      {
        toPlusToken: `prospect-${prospect.id}`,
        from: 'sam@stop.example',
        subject: 'Re: A new website',
        text: 'Please unsubscribe me from these emails.',
      },
      { rawJson: '{}', rawDir },
    )
    expect(result.suppressed).toBe(true)
    const entries = await db
      .select()
      .from(suppressionList)
      .where(eq(suppressionList.prospectId, prospect.id))
    expect(entries.map((e) => e.kind)).toContain('email')
    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(after?.status).toBe('suppressed')
  })

  it("moves a 'contacted' prospect to 'replied' but never demotes a later status", async () => {
    const { prospect } = await seedThread('statusflip')
    const rawDir = await mkdtemp(path.join(os.tmpdir(), 'raw-mail-'))
    const email = {
      toPlusToken: `prospect-${prospect.id}`,
      from: 'sam@statusflip.example',
      subject: 'Re: A new website',
      text: 'Looks great!',
    }

    await db.update(prospects).set({ status: 'contacted' }).where(eq(prospects.id, prospect.id))
    await handleInboundEmail(db, email, { rawJson: '{}', rawDir })
    const [afterContacted] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(afterContacted?.status).toBe('replied')

    // a converted customer replying by email must stay converted
    await db.update(prospects).set({ status: 'converted' }).where(eq(prospects.id, prospect.id))
    await handleInboundEmail(db, email, { rawJson: '{}', rawDir })
    const [afterConverted] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(afterConverted?.status).toBe('converted')
  })

  it('ignores mail with no matching prospect token', async () => {
    const rawDir = await mkdtemp(path.join(os.tmpdir(), 'raw-mail-'))
    const result = await handleInboundEmail(
      db,
      { toPlusToken: null, from: 'x@y.example', subject: 's', text: 'b' },
      { rawJson: '{}', rawDir },
    )
    expect(result.matched).toBe(false)
  })
})
