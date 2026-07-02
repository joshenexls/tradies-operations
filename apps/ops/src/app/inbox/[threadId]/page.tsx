import { asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { inboxMessages, inboxThreads, prospects } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { relativeTime } from '@/lib/format'
import { isUuid } from '@/lib/uuid'
import { Badge, entityTone } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ThreadActions } from './thread-actions'

export const dynamic = 'force-dynamic'

export default async function InboxThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  const { threadId } = await params
  if (!isUuid(threadId)) notFound()
  const db = getDb()
  const [thread] = await db
    .select()
    .from(inboxThreads)
    .where(eq(inboxThreads.id, threadId))
    .limit(1)
  if (!thread) notFound()
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, thread.prospectId))
    .limit(1)
  if (!prospect) notFound()
  const messages = await db
    .select()
    .from(inboxMessages)
    .where(eq(inboxMessages.threadId, threadId))
    .orderBy(asc(inboxMessages.createdAt))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {prospect.businessName ?? '(unnamed)'}
          </h1>
          <p className="text-sm text-zinc-500">{thread.subject ?? '(no subject)'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={thread.status === 'needs_reply' ? 'amber' : 'grey'}>
            {thread.status.replace('_', ' ')}
          </Badge>
          <Badge tone={entityTone(prospect.entityType)}>{prospect.entityType}</Badge>
          <Link
            href={`/prospects/${prospect.id}`}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Prospect →
          </Link>
          <Link href="/inbox" className="text-sm font-medium text-indigo-600 hover:underline">
            ← Inbox
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader title="Conversation" />
        <CardBody className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-400">No messages on this thread yet.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                data-testid="inbox-message"
                className={`max-w-[85%] rounded-md border px-3 py-2 text-sm ${
                  message.direction === 'inbound'
                    ? 'border-zinc-200 bg-zinc-50 text-zinc-800'
                    : 'ml-auto border-indigo-100 bg-indigo-50 text-zinc-800'
                }`}
              >
                <p className="mb-1 text-[11px] text-zinc-400">
                  {message.direction === 'inbound'
                    ? (message.fromAddr ?? 'prospect')
                    : `you → ${message.toAddr ?? ''}`}{' '}
                  · {relativeTime(message.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">
                  {message.bodyText ?? '(no text body — reply received, full text pending)'}
                </p>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <ThreadActions threadId={thread.id} suppressed={prospect.suppressedAt !== null} />
    </div>
  )
}
