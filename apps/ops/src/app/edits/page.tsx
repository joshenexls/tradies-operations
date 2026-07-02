import Link from 'next/link'
import { getDb } from '@/lib/db'
import { formatDate, relativeTime } from '@/lib/format'
import { operatorPreviewUrl } from '@/lib/preview-url'
import { listEditRequests } from '@/server/core/edits'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { EditActions } from './edit-actions'

export const dynamic = 'force-dynamic'

export default async function EditsPage() {
  const db = getDb()
  const queue = await listEditRequests(db, ['new', 'in_progress'])
  const resolved = (await listEditRequests(db, ['done', 'declined'])).slice(0, 10)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Edit requests</h1>
        <p className="text-sm text-zinc-500">
          {queue.length} in the queue — prospects and customers asking for changes to their site
        </p>
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-zinc-400">
            No open edit requests — changes requested from a preview or the portal land here.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map(({ editRequest, prospectId, businessName, slug }) => (
            <Card key={editRequest.id} data-testid="edit-request-card">
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={editRequest.requestedBy === 'customer' ? 'indigo' : 'blue'}>
                    {editRequest.requestedBy ?? 'prospect'}
                  </Badge>
                  {editRequest.status === 'in_progress' ? (
                    <Badge tone="amber">in progress</Badge>
                  ) : null}
                  <Link
                    href={`/prospects/${prospectId}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {businessName ?? '(unnamed)'}
                  </Link>
                  <a
                    href={operatorPreviewUrl(slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    {slug} ↗
                  </a>
                  <span className="ml-auto text-xs text-zinc-400">
                    {relativeTime(editRequest.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                  {editRequest.body ?? '(no message)'}
                </p>
                <EditActions editRequestId={editRequest.id} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-zinc-600">
          Recently resolved ({resolved.length})
        </summary>
        <div className="mt-2 space-y-2">
          {resolved.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing resolved yet.</p>
          ) : (
            resolved.map(({ editRequest, prospectId, businessName }) => (
              <div
                key={editRequest.id}
                data-testid="resolved-edit-row"
                className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-100 bg-white px-3 py-2 text-sm"
              >
                <Badge tone={editRequest.status === 'done' ? 'green' : 'red'}>
                  {editRequest.status}
                </Badge>
                <Link
                  href={`/prospects/${prospectId}`}
                  className="font-medium text-indigo-600 hover:underline"
                >
                  {businessName ?? '(unnamed)'}
                </Link>
                <span className="max-w-96 truncate text-zinc-500">{editRequest.body ?? ''}</span>
                {editRequest.resultingSpecVersion != null ? (
                  <span className="font-mono text-xs text-zinc-500">
                    → v{editRequest.resultingSpecVersion}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-zinc-400">
                  {formatDate(editRequest.updatedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  )
}
