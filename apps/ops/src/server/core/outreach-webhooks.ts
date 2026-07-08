import { and, desc, eq } from 'drizzle-orm'
import type { InboxThreadRow } from '@tradies/db'
import {
  events,
  inboxMessages,
  inboxThreads,
  outreachMessages,
  prospects,
} from '@tradies/db/schema'
import type { SmartleadWebhookEvent } from '@tradies/integrations'
import type { getDb } from '@/lib/db'
import { suppressProspect } from './suppress'

type Db = ReturnType<typeof getDb>

const STATUS_BY_KIND = {
  sent: 'sent',
  open: 'opened',
  click: 'clicked',
  reply: 'replied',
  bounce: 'bounced',
  unsubscribe: 'unsubscribed',
} as const

/**
 * Apply one mapped Smartlead webhook event: message status, then the
 * side-effects — replies open an inbox thread, bounces/unsubscribes suppress.
 * Unmatched events are recorded and ignored (the route still 200s so
 * Smartlead stops retrying).
 */
export async function handleSmartleadEvent(
  db: Db,
  event: SmartleadWebhookEvent,
): Promise<{ handled: boolean; prospectId?: string; threadId?: string }> {
  const [message] = event.leadId
    ? await db
        .select()
        .from(outreachMessages)
        .where(eq(outreachMessages.smartleadLeadId, event.leadId))
        .orderBy(desc(outreachMessages.createdAt))
        .limit(1)
    : []
  if (!message) {
    await db.insert(events).values({
      actor: 'system',
      type: 'outreach_webhook_unmatched',
      payload: { kind: event.kind, leadId: event.leadId ?? null, email: event.email ?? null },
    })
    return { handled: false }
  }

  await db
    .update(outreachMessages)
    .set({
      status: STATUS_BY_KIND[event.kind],
      ...(event.kind === 'sent' ? { sentAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(outreachMessages.id, message.id))

  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, message.prospectId))
    .limit(1)
  if (!prospect) return { handled: false }

  let threadId: string | undefined
  if (event.kind === 'reply') {
    const thread = await upsertEmailThread(db, {
      prospectId: prospect.id,
      subject: message.subject,
    })
    threadId = thread.id
    await db.insert(inboxMessages).values({
      threadId: thread.id,
      direction: 'inbound',
      fromAddr: event.email ?? null,
      // Smartlead's reply webhook carries no body — the full text arrives via
      // the Resend inbound route; this row flags that a reply exists.
      bodyText: null,
      providerId: event.leadId ?? null,
    })
    await db
      .update(prospects)
      .set({ status: 'replied', updatedAt: new Date() })
      .where(eq(prospects.id, prospect.id))
  }

  if (event.kind === 'bounce' || event.kind === 'unsubscribe') {
    await suppressProspect(db, prospect, {
      reason: event.kind === 'bounce' ? 'bounce' : 'unsubscribe',
      sourceChannel: 'email_cold',
      email: event.email ?? null,
    })
  }

  await db.insert(events).values({
    prospectId: prospect.id,
    actor: event.kind === 'sent' ? 'system' : 'prospect',
    type: 'outreach_webhook',
    payload: {
      kind: event.kind,
      messageId: message.id,
      leadId: event.leadId ?? null,
      campaignId: event.campaignId ?? null,
    },
  })
  return { handled: true, prospectId: prospect.id, threadId }
}

/**
 * One email thread per prospect: replies re-open it as needs_reply rather
 * than fragmenting the conversation across threads.
 */
export async function upsertEmailThread(
  db: Db,
  input: { prospectId: string; subject: string | null },
): Promise<InboxThreadRow> {
  const [existing] = await db
    .select()
    .from(inboxThreads)
    .where(and(eq(inboxThreads.prospectId, input.prospectId), eq(inboxThreads.channel, 'email')))
    .orderBy(desc(inboxThreads.createdAt))
    .limit(1)
  if (existing) {
    const [updated] = await db
      .update(inboxThreads)
      .set({ status: 'needs_reply', lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(inboxThreads.id, existing.id))
      .returning()
    return updated ?? existing
  }
  const [created] = await db
    .insert(inboxThreads)
    .values({
      prospectId: input.prospectId,
      channel: 'email',
      subject: input.subject,
      status: 'needs_reply',
      lastMessageAt: new Date(),
    })
    .returning()
  if (!created) throw new Error('failed to create inbox thread')
  return created
}
