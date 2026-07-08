import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import {
  entityTypeEnum,
  prospectCosts,
  prospectSegmentEnum,
  prospectStatusEnum,
  prospects,
  sites,
} from '@tradies/db/schema'
import { listActivePresets } from '@tradies/engine'
import { TRADES } from '@tradies/site-spec'
import { getDb } from '@/lib/db'
import { operatorPreviewUrl } from '@/lib/preview-url'
import { previewEngagement } from '@/lib/queries'
import { FilterBar } from './filter-bar'
import { NewProspectDialog } from './new-prospect-dialog'
import { PipelineTable, type PipelineRow } from './pipeline-table'

export const dynamic = 'force-dynamic'

function pickEnum<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined {
  return values.includes(value as T) ? (value as T) : undefined
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const status = pickEnum(prospectStatusEnum.enumValues, single(params.status))
  const segment = pickEnum(prospectSegmentEnum.enumValues, single(params.segment))
  const trade = pickEnum(TRADES, single(params.trade))
  const entityType = pickEnum(entityTypeEnum.enumValues, single(params.entityType))
  const city = single(params.city)?.trim() || undefined

  const db = getDb()
  const filters = [
    status ? eq(prospects.status, status) : undefined,
    segment ? eq(prospects.segment, segment) : undefined,
    trade ? eq(prospects.trade, trade) : undefined,
    entityType ? eq(prospects.entityType, entityType) : undefined,
    city ? ilike(prospects.city, `%${city}%`) : undefined,
  ].filter((f) => f !== undefined)

  const rows = await db
    .select({ prospect: prospects, slug: sites.slug })
    .from(prospects)
    .leftJoin(sites, eq(sites.prospectId, prospects.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(prospects.createdAt))
    .limit(200)

  const costRows = await db
    .select({
      prospectId: prospectCosts.prospectId,
      total: sql<string>`coalesce(sum(${prospectCosts.amountMicroGbp}), 0)`,
    })
    .from(prospectCosts)
    .groupBy(prospectCosts.prospectId)
  const costByProspect = new Map(costRows.map((r) => [r.prospectId, Number(r.total)]))

  const presets = await listActivePresets(db)
  const styleKeys = [...new Set(presets.map((p) => p.row.styleKey))].sort()

  const engagement = await previewEngagement(
    db,
    rows.map(({ prospect }) => prospect.id),
  )

  const data: PipelineRow[] = rows.map(({ prospect, slug }) => ({
    id: prospect.id,
    name: prospect.businessName ?? '(unnamed)',
    trade: prospect.trade,
    city: prospect.city,
    segment: prospect.segment,
    healthScore: prospect.websiteHealthScore,
    entityType: prospect.entityType,
    status: prospect.status,
    slug,
    previewHref: slug ? operatorPreviewUrl(slug) : null,
    visits: engagement.get(prospect.id)?.visits ?? 0,
    devices: engagement.get(prospect.id)?.devices ?? 0,
    costMicroGbp: costByProspect.get(prospect.id) ?? 0,
    createdAt: prospect.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-zinc-500">
            {data.length} prospect{data.length === 1 ? '' : 's'}
            {filters.length > 0 ? ' (filtered)' : ''} — newest first, capped at 200
          </p>
        </div>
        <NewProspectDialog styleKeys={styleKeys} trades={[...TRADES]} />
      </div>
      <FilterBar
        current={{ status, segment, trade, entityType, city }}
        options={{
          statuses: [...prospectStatusEnum.enumValues],
          segments: [...prospectSegmentEnum.enumValues],
          trades: [...TRADES],
          entityTypes: [...entityTypeEnum.enumValues],
        }}
      />
      <PipelineTable rows={data} />
    </div>
  )
}
