/**
 * Seeds the local PGlite database with generated sites for every prospect
 * fixture (deterministic slugs = fixture keys) so the dev server and the
 * Playwright visual suite have stable tenants. Run while the dev server is
 * STOPPED — PGlite is single-process.
 *
 *   pnpm --filter @tradies/sites seed
 */
import { createPgliteDb } from '@tradies/db'
import { migrateDb } from '@tradies/db/migrate'
import { prospects, sites, siteSpecs, stylePresets } from '@tradies/db/schema'
import { allProspectFixtures } from '@tradies/fixtures'
import { FixtureLLM } from '@tradies/llm'
import {
  parseSiteSpec,
  resolveStylePreset,
  validateSpecAgainstFacts,
  validateSpecAgainstPreset,
} from '@tradies/site-spec'
import { SEED_STYLE_PRESETS } from '@tradies/templates'

const STYLE_ROTATION = ['modern', 'heritage', 'bold'] as const

async function main() {
  const dir = process.env.PGLITE_DIR ?? '.pglite/dev'
  const db = createPgliteDb(dir)
  await migrateDb(db)

  await db
    .insert(stylePresets)
    .values(
      SEED_STYLE_PRESETS.map((preset) => ({
        styleKey: preset.styleKey,
        name: preset.name,
        trade: preset.trade,
        templateId: preset.templateId,
        description: preset.description ?? null,
        paletteId: preset.paletteId,
        fontPairId: preset.fontPairId,
        radius: preset.radius,
        variantWeights: preset.variantWeights,
        preferredSections: preset.preferredSections ?? null,
        imageryPool: preset.imageryPool,
        tone: preset.tone,
        status: preset.status,
      })),
    )
    .onConflictDoNothing()

  const generator = new FixtureLLM()
  let seeded = 0
  for (const [i, fixture] of allProspectFixtures.entries()) {
    const styleKey = STYLE_ROTATION[i % STYLE_ROTATION.length]!
    const preset = resolveStylePreset(SEED_STYLE_PRESETS, styleKey, fixture.trade)
    if (!preset) throw new Error(`no preset for ${styleKey}/${fixture.trade}`)

    const { candidate } = await generator.generateSiteSpec({ facts: fixture.facts, preset })
    const spec = parseSiteSpec(candidate)
    const factReport = validateSpecAgainstFacts(spec)
    const presetReport = validateSpecAgainstPreset(spec, preset)
    if (!factReport.ok || !presetReport.ok) {
      throw new Error(
        `fixture ${fixture.key} failed validation: ${JSON.stringify({ factReport, presetReport })}`,
      )
    }

    const [prospect] = await db
      .insert(prospects)
      .values({
        placeId: fixture.places.placeId,
        hasWebsite: fixture.hasWebsite,
        isFacebookOnly: fixture.isFacebookOnly,
        overtureId: fixture.overture.overtureId,
        businessName: fixture.businessName,
        phone: fixture.overture.phone ?? null,
        websiteUrl: fixture.websiteUrl ?? null,
        postcode: fixture.overture.postcode ?? null,
        city: fixture.town,
        trade: fixture.trade,
        source: 'manual',
        entityType: fixture.entityType,
        status: 'in_review',
        segment: fixture.expectedSegment,
      })
      .onConflictDoNothing()
      .returning()
    if (!prospect) continue

    await db.insert(siteSpecs).values({
      prospectId: prospect.id,
      version: 1,
      spec,
      templateId: spec.templateId,
      model: 'fixture-llm',
      promptVersion: 'site-spec-v1',
      validationReport: { fact: factReport, preset: presetReport },
      generatedBy: 'llm',
    })
    await db.insert(sites).values({
      prospectId: prospect.id,
      slug: fixture.key,
      currentSpecVersion: 1,
      status: 'preview',
      noindex: true,
      claimToken: `claim-${fixture.key}`,
      portalToken: `portal-${fixture.key}`,
    })
    seeded++
  }
  console.log(`Seeded ${seeded} fixture sites into ${dir}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
