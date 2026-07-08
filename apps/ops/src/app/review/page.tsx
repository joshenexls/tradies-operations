import { desc, sql } from 'drizzle-orm'
import Link from 'next/link'
import { reviewBatches, reviewRequests } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Table, TableShell, Td, Th } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function ReviewIndexPage() {
  const db = getDb()
  const batches = await db
    .select()
    .from(reviewBatches)
    .orderBy(desc(reviewBatches.createdAt))
    .limit(50)
  const counts = await db
    .select({
      batchId: reviewRequests.batchId,
      total: sql<string>`count(*)`,
      decided: sql<string>`count(*) filter (where ${reviewRequests.status} <> 'pending')`,
    })
    .from(reviewRequests)
    .groupBy(reviewRequests.batchId)
  const countsByBatch = new Map(
    counts.map((c) => [c.batchId, { total: Number(c.total), decided: Number(c.decided) }]),
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Review batches</h1>
        <p className="text-sm text-zinc-500">
          Create batches from the pipeline — select rows, then “Add to review batch”.
        </p>
      </div>
      <TableShell>
        <Table>
          <thead>
            <tr>
              <Th>Batch</Th>
              <Th>City</Th>
              <Th>Progress</Th>
              <Th>Auto-approve</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const count = countsByBatch.get(batch.id) ?? { total: 0, decided: 0 }
              return (
                <tr key={batch.id} className="hover:bg-zinc-50" data-testid="batch-row">
                  <Td>
                    <Link
                      href={`/review/${batch.id}`}
                      className="font-medium text-zinc-900 hover:text-indigo-600 hover:underline"
                    >
                      {batch.label ?? 'Untitled batch'}
                    </Link>
                  </Td>
                  <Td>{batch.city ?? '—'}</Td>
                  <Td>
                    <span className="font-mono text-xs">
                      {count.decided}/{count.total} decided
                    </span>
                    <span className="ml-2 inline-block h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 align-middle">
                      <span
                        className="block h-full bg-indigo-500"
                        style={{
                          width: count.total > 0 ? `${(count.decided / count.total) * 100}%` : 0,
                        }}
                      />
                    </span>
                  </Td>
                  <Td>{batch.autoApprove ? <Badge tone="amber">auto-approve</Badge> : '—'}</Td>
                  <Td className="text-xs text-zinc-500">{formatDate(batch.createdAt)}</Td>
                </tr>
              )
            })}
            {batches.length === 0 ? (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-zinc-400">
                  No review batches yet
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </TableShell>
    </div>
  )
}
