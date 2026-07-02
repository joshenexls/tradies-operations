import { desc, eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { inboxThreads, prospects } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { relativeTime } from '@/lib/format'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const threadTone = (status: string): BadgeTone =>
  status === 'needs_reply' ? 'amber' : status === 'closed' ? 'grey' : 'blue'

export default async function InboxPage() {
  const db = getDb()
  const rows = await db
    .select({ thread: inboxThreads, prospect: prospects })
    .from(inboxThreads)
    .innerJoin(prospects, eq(inboxThreads.prospectId, prospects.id))
    .orderBy(
      sql`case when ${inboxThreads.status} = 'needs_reply' then 0 else 1 end`,
      desc(inboxThreads.lastMessageAt),
    )

  const needsReply = rows.filter((r) => r.thread.status === 'needs_reply').length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-zinc-500">
          {rows.length} thread{rows.length === 1 ? '' : 's'}
          {needsReply > 0 ? ` · ${needsReply} awaiting a reply` : ''}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-zinc-400">
            No conversations yet — replies to outreach land here.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div>
            {rows.map(({ thread, prospect }) => (
              <Link
                key={thread.id}
                href={`/inbox/${thread.id}`}
                data-testid="inbox-thread-row"
                className="flex items-center gap-3 border-b border-zinc-50 px-4 py-3 text-sm last:border-b-0 hover:bg-zinc-50"
              >
                <Badge tone={threadTone(thread.status)}>{thread.status.replace('_', ' ')}</Badge>
                <span className="font-medium text-zinc-800">
                  {prospect.businessName ?? '(unnamed)'}
                </span>
                <span className="truncate text-zinc-500">{thread.subject ?? '(no subject)'}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-400">
                  {thread.lastMessageAt ? relativeTime(thread.lastMessageAt) : ''}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
