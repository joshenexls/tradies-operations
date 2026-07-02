import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { stylePresets } from '@tradies/db/schema'
import { allProspectFixtures } from '@tradies/fixtures'
import { getDb } from '@/lib/db'
import { isUuid } from '@/lib/uuid'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { FixtureSelect } from '../fixture-select'
import { presetFormOptions } from '../form-options'
import { PresetForm } from '../preset-form'
import { SampleRender } from '../sample-render'

export const dynamic = 'force-dynamic'

export default async function EditPresetPage({
  params,
  searchParams,
}: {
  params: Promise<{ presetId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { presetId } = await params
  if (!isUuid(presetId)) notFound()
  const db = getDb()
  const [row] = await db.select().from(stylePresets).where(eq(stylePresets.id, presetId)).limit(1)
  if (!row) notFound()

  const rawFixture = (await searchParams).fixture
  const requested = Array.isArray(rawFixture) ? rawFixture[0] : rawFixture
  const defaultKey = allProspectFixtures.find((f) => f.trade === 'plumber')?.key
  const fixtureKey = allProspectFixtures.find((f) => f.key === requested)?.key ?? defaultKey ?? ''

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">
        Edit system — {row.name}
        <span className="ml-2 font-mono text-sm font-normal text-zinc-400">{row.styleKey}</span>
      </h1>
      <div className="grid gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
        <Card>
          <CardHeader title="System settings" />
          <CardBody>
            <PresetForm
              initial={{
                id: row.id,
                styleKey: row.styleKey,
                name: row.name,
                trade: row.trade ?? '',
                templateId: row.templateId,
                description: row.description ?? '',
                paletteId: row.paletteId,
                fontPairId: row.fontPairId,
                radius: row.radius ?? 'soft',
                tone: row.tone ?? 'professional',
                imageryPool: row.imageryPool ?? '',
                preferredSections: row.preferredSections ?? [],
                variantWeights: (row.variantWeights ?? {}) as Record<
                  string,
                  Record<string, number>
                >,
                status: row.status,
              }}
              options={presetFormOptions()}
            />
          </CardBody>
        </Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <FixtureSelect
              presetId={row.id}
              current={fixtureKey}
              fixtures={allProspectFixtures.map((fixture) => ({
                key: fixture.key,
                label: `${fixture.businessName} (${fixture.trade}, ${fixture.town})`,
              }))}
            />
            <p className="text-xs text-zinc-400">
              Renders the last saved version — save to refresh.
            </p>
          </div>
          <SampleRender row={row} fixtureKey={fixtureKey} />
        </div>
      </div>
    </div>
  )
}
