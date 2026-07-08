import type { StylePresetRow } from '@tradies/db'
import { presetFromRow } from '@tradies/engine'
import { allProspectFixtures } from '@tradies/fixtures'
import { FixtureLLM } from '@tradies/llm'
import { buildSiteLocation, parseSiteSpec } from '@tradies/site-spec'
import { renderSite, type TemplateContext } from '@tradies/templates'

/**
 * Renders the CURRENT SAVED preset against a fixture facts sheet through the
 * real deterministic generator + validators-by-construction path. FixtureLLM
 * only ever states what the facts evidence, so this can never violate
 * FACT-GUARD. Images come from the local /pool route (copied from apps/sites)
 * so the render is fully self-contained.
 */
export async function SampleRender({
  row,
  fixtureKey,
}: {
  row: StylePresetRow
  fixtureKey?: string
}) {
  const fixture =
    allProspectFixtures.find((f) => f.key === fixtureKey) ??
    allProspectFixtures.find((f) => f.trade === 'plumber') ??
    allProspectFixtures[0]
  if (!fixture) return null

  const preset = presetFromRow(row)
  const result = await new FixtureLLM().generateSiteSpec({ facts: fixture.facts, preset })
  const spec = parseSiteSpec(result.candidate)
  const ctx: TemplateContext = {
    resolveImage: (ref) => ({
      src: `/pool/${encodeURIComponent(ref.pool)}/${ref.index}`,
      width: 1600,
      height: 1000,
    }),
    leadFormAction: '#',
    placeId: null,
    location: buildSiteLocation({
      businessName: fixture.facts.businessName,
      town: fixture.facts.town,
      placeId: fixture.places.placeId,
    }),
    previewBanner: null,
  }

  return (
    <div
      data-testid="sample-render"
      className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
      style={{ zoom: 0.5 }}
    >
      {renderSite(spec, ctx)}
    </div>
  )
}
