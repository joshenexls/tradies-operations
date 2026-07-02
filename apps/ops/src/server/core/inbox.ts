import { eq } from 'drizzle-orm'
import { events, inboxMessages, inboxThreads, prospects } from '@tradies/db/schema'
import type { ResendMailer } from '@tradies/integrations'
import type { getDb } from '@/lib/db'
import { suppressProspect } from './suppress'

type Db = ReturnType<typeof getDb>

export type InboxActionResult = { ok: true; messageId?: string } | { error: string }

/**
 * Send an operator reply on a thread: outbound mail via the injected mailer
 * (fixture in dev/tests, Resend in prod), an outbound inbox_messages row, and
 * the thread back to 'open' — it no longer needs a reply.
 */
export async function sendReplyCore(
  db: Db,
  mailer: ResendMailer,
  input: { threadId: string; body: string; from?: string },
): Promise<InboxActionResult> {
  const body = input.body.trim()
  if (!body) return { error: 'Reply body is required' }

  const [thread] = await db
    .select()
    .from(inboxThreads)
    .where(eq(inboxThreads.id, input.threadId))
    .limit(1)
  if (!thread) return { error: 'Thread not found' }
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, thread.prospectId))
    .limit(1)
  if (!prospect) return { error: 'Prospect not found' }
  if (prospect.suppressedAt) {
    return { error: 'Prospect is suppressed — no further contact on any channel' }
  }
  const to = prospect.extractedProfile?.email?.value
  if (!to) return { error: 'Prospect has no evidenced email address to reply to' }

  const from = input.from ?? process.env.INBOX_FROM_EMAIL ?? 'Tradies Studio <studio@localhost>'
  const subject = thread.subject
    ? /^re:/i.test(thread.subject)
      ? thread.subject
      : `Re: ${thread.subject}`
    : 'Re: your new website'

  const { providerId } = await mailer.send({ from, to, subject, text: body })

  const [message] = await db
    .insert(inboxMessages)
    .values({
      threadId: thread.id,
      direction: 'outbound',
      fromAddr: from,
      toAddr: to,
      bodyText: body,
      providerId,
    })
    .returning()
  await db
    .update(inboxThreads)
    .set({ status: 'open', lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(inboxThreads.id, thread.id))
  await db.insert(events).values({
    prospectId: thread.prospectId,
    actor: 'operator',
    type: 'inbox_reply_sent',
    payload: { threadId: thread.id, messageId: message?.id ?? null, providerId },
  })
  return { ok: true, messageId: message?.id }
}

export async function closeThreadCore(db: Db, threadId: string): Promise<InboxActionResult> {
  const [thread] = await db
    .select()
    .from(inboxThreads)
    .where(eq(inboxThreads.id, threadId))
    .limit(1)
  if (!thread) return { error: 'Thread not found' }
  await db
    .update(inboxThreads)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(inboxThreads.id, threadId))
  return { ok: true }
}

/** Close the thread AND suppress the prospect everywhere (they asked to stop). */
export async function suppressAndCloseThreadCore(
  db: Db,
  threadId: string,
): Promise<InboxActionResult> {
  const [thread] = await db
    .select()
    .from(inboxThreads)
    .where(eq(inboxThreads.id, threadId))
    .limit(1)
  if (!thread) return { error: 'Thread not found' }
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, thread.prospectId))
    .limit(1)
  if (!prospect) return { error: 'Prospect not found' }

  await suppressProspect(db, prospect, {
    reason: 'unsubscribe',
    sourceChannel: 'inbox',
    includePhone: true,
    includePlaceId: true,
    recordedBy: 'operator',
    actor: 'operator',
  })
  await db
    .update(inboxThreads)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(inboxThreads.id, threadId))
  return { ok: true }
}
