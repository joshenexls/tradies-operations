import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Prospect, ReviewRequestRow, SiteRow, SiteSpecRow } from '@tradies/db'
import { prospects, reviewBatches, reviewRequests, siteSpecs, sites } from '@tradies/db/schema'
import { listActivePresets } from '@tradies/engine'
import { getDb } from '@/lib/db'
import { formatDate, relativeTime } from '@/lib/format'
import { previewUrl } from '@/lib/preview-url'
import { latestEntityNote } from '@/lib/queries'
import { isUuid } from '@/lib/uuid'
import { EntityControl } from '@/components/entity-control'
import { FactsPanel } from '@/components/facts-panel'
import { Badge, entityTone, segmentTone, statusTone } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { DecisionForm, type PresetOption } from './decision-form'
import { PreviewFrame } from './preview-frame'

export const dynamic = 'force-dynamic'

type CardData = {
  request: ReviewRequestRow
  prospect: Prospect
  site: SiteRow | undefined
  specRow: SiteSpecRow | undefined
  latestNote: string | null
}

export default async function ReviewBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  if (!isUuid(batchId)) notFound()
  const db = getDb()
  const [batch] = await db
    .select()
    .from(reviewBatches)
    .where(eq(reviewBatches.id, batchId))
    .limit(1)
  if (!batch) notFound()

  const requests = await db
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.batchId, batchId))
    .orderBy(reviewRequests.createdAt)

  const presetOptions: PresetOption[] = (await listActivePresets(db)).map(({ row }) => ({
    id: row.id,
    name: row.name,
    trade: row.trade,
  }))

  const cards: CardData[] = []
  for (const request of requests) {
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.id, request.prospectId))
      .limit(1)
    if (!prospect) continue
    const [site] = await db.select().from(sites).where(eq(sites.prospectId, prospect.id)).limit(1)
    let specRow: SiteSpecRow | undefined
    if (site?.currentSpecVersion != null) {
      ;[specRow] = await db
        .select()
        .from(siteSpecs)
        .where(
          and(
            eq(siteSpecs.prospectId, prospect.id),
            eq(siteSpecs.version, site.currentSpecVersion),
          ),
        )
        .limit(1)
    }
    cards.push({
      request,
      prospect,
      site,
      specRow,
      latestNote: await latestEntityNote(db, prospect.id),
    })
  }

  const pending = cards.filter((c) => c.request.status === 'pending')
  const decided = cards.filter((c) => c.request.status !== 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {batch.label ?? 'Untitled batch'}
          </h1>
          <p className="text-sm text-zinc-500">
            <span data-testid="batch-progress" className="font-mono">
              {decided.length}/{cards.length} decided
            </span>
            {batch.city ? ` · ${batch.city}` : ''} · created {formatDate(batch.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batch.autoApprove ? <Badge tone="amber">auto-approve</Badge> : null}
          <Link href="/review" className="text-sm font-medium text-indigo-600 hover:underline">
            ← All batches
          </Link>
        </div>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-zinc-400">
            Nothing pending — every request in this batch is decided.
          </CardBody>
        </Card>
      ) : null}

      {pending.map(({ request, prospect, site, specRow, latestNote }) => (
        <Card key={request.id} data-testid="review-card">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span data-testid="review-prospect-name">
                  {prospect.businessName ?? '(unnamed)'}
                </span>
                <span className="text-xs font-normal text-zinc-400">
                  {prospect.trade ?? '—'} · {prospect.city ?? '—'}
                </span>
              </span>
            }
            right={
              <span className="flex items-center gap-2">
                {prospect.segment ? (
                  <Badge tone={segmentTone(prospect.segment)}>{prospect.segment}</Badge>
                ) : null}
                {prospect.websiteHealthScore !== null ? (
                  <span className="font-mono text-xs text-zinc-500">
                    health {prospect.websiteHealthScore}
                  </span>
                ) : null}
                <Badge tone={entityTone(prospect.entityType)}>{prospect.entityType}</Badge>
                <Link
                  href={`/prospects/${prospect.id}`}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Prospect →
                </Link>
              </span>
            }
          />
          <CardBody className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            {site ? (
              <PreviewFrame
                src={previewUrl(site.slug)}
                title={`Preview of ${prospect.businessName ?? site.slug}`}
              />
            ) : (
              <div className="flex h-[640px] items-center justify-center rounded-md border border-dashed border-zinc-200 text-sm text-zinc-400">
                No site generated yet
              </div>
            )}
            <div className="space-y-4">
              {specRow ? (
                <FactsPanel facts={specRow.spec.facts} />
              ) : (
                <p className="text-sm text-zinc-400">No spec on record for this prospect.</p>
              )}
              <div className="rounded-md border border-zinc-200 p-3">
                <EntityControl
                  prospectId={prospect.id}
                  businessName={prospect.businessName ?? ''}
                  entityType={prospect.entityType}
                  entityCheckedAt={
                    prospect.entityCheckedAt ? relativeTime(prospect.entityCheckedAt) : null
                  }
                  companiesHouseNumber={prospect.companiesHouseNumber}
                  latestNote={latestNote}
                />
              </div>
              <DecisionForm
                requestId={request.id}
                presets={presetOptions}
                currentPresetId={specRow?.stylePresetId ?? null}
              />
              <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-400">
                Pitch preview — arrives in Phase 5 (outreach)
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      <details className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-700">
          Decided ({decided.length})
        </summary>
        <div className="border-t border-zinc-100">
          {decided.map(({ request, prospect }) => (
            <div
              key={request.id}
              data-testid="decided-row"
              className="flex items-center gap-3 border-b border-zinc-50 px-4 py-2 text-sm"
            >
              <Badge tone={statusTone(request.status)}>{request.status}</Badge>
              <Link
                href={`/prospects/${prospect.id}`}
                className="font-medium text-zinc-800 hover:text-indigo-600 hover:underline"
              >
                {prospect.businessName ?? '(unnamed)'}
              </Link>
              <span className="text-xs text-zinc-400">
                {request.decidedAt ? `decided ${relativeTime(request.decidedAt)}` : ''}
                {request.notes ? ` — ${request.notes}` : ''}
              </span>
            </div>
          ))}
          {decided.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-400">No decisions yet.</p>
          ) : null}
        </div>
      </details>
    </div>
  )
}
