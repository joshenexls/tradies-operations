import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { events, inboxMessages, prospects } from '@tradies/db/schema'
import type { ResendInboundEmail } from '@tradies/integrations'
import type { getDb } from '@/lib/db'
import { isUuid } from '@/lib/uuid'
import { upsertEmailThread } from './outreach-webhooks'
import { suppressProspect } from './suppress'

type Db = ReturnType<typeof getDb>

/** 'STOP' (whole word) or any mention of unsubscribing counts as an opt-out. */
const OPT_OUT = /\bSTOP\b|unsubscribe/i

/**
 * File an inbound reply (Resend webhook) into the inbox. The raw payload is
 * written to RAW_MAIL_DIR (default .raw-mail) and only the pointer is stored
 * — the DB never holds full MIME payloads. Opt-out language in the body
 * auto-suppresses instead of asking the operator to reply.
 */
export async function handleInboundEmail(
  db: Db,
  email: ResendInboundEmail,
  opts: { rawJson: string; rawDir?: string },
): Promise<{ matched: boolean; threadId?: string; suppressed?: boolean }> {
  const prospectId = email.toPlusToken?.replace(/^prospect-/, '') ?? null
  const [prospect] =
    prospectId && isUuid(prospectId)
      ? await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
      : []
  if (!prospect) {
    await db.insert(events).values({
      actor: 'system',
      type: 'inbound_email_unmatched',
      payload: {
        toPlusToken: email.toPlusToken,
        from: email.from,
        subject: email.subject,
      },
    })
    return { matched: false }
  }

  const rawRef = await writeRawMail(opts.rawJson, opts.rawDir)

  const thread = await upsertEmailThread(db, {
    prospectId: prospect.id,
    subject: email.subject || null,
  })
  await db.insert(inboxMessages).values({
    threadId: thread.id,
    direction: 'inbound',
    fromAddr: email.from,
    bodyText: email.text || null,
    bodyHtml: email.html ?? null,
    rawRef,
  })

  const optOut = OPT_OUT.test(email.text)
  if (optOut) {
    await suppressProspect(db, prospect, {
      reason: 'unsubscribe',
      sourceChannel: 'email_reply',
      email: email.from,
    })
  } else if (prospect.status === 'contacted') {
    // a reply moves the pipeline forward, but never demotes a later status
    // (claimed/converted customers also reply by email)
    await db
      .update(prospects)
      .set({ status: 'replied', updatedAt: new Date() })
      .where(eq(prospects.id, prospect.id))
  }

  await db.insert(events).values({
    prospectId: prospect.id,
    actor: 'prospect',
    type: 'inbound_email',
    payload: { threadId: thread.id, subject: email.subject, optOut, rawRef },
  })
  return { matched: true, threadId: thread.id, suppressed: optOut }
}

async function writeRawMail(rawJson: string, rawDir?: string): Promise<string> {
  const dir = rawDir ?? process.env.RAW_MAIL_DIR ?? '.raw-mail'
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`
  await mkdir(dir, { recursive: true })
  const ref = path.join(dir, name)
  await writeFile(ref, rawJson, 'utf8')
  return ref
}
