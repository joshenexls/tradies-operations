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
import { prospects } from '@tradies/db/schema'
import { generateSiteVersion, resolveActivePreset, seedStylePresets } from '@tradies/engine'
import { allProspectFixtures } from '@tradies/fixtures'
import { FixtureLLM } from '@tradies/llm'

const STYLE_ROTATION = ['modern', 'heritage', 'bold'] as const

async function main() {
  const dir = process.env.PGLITE_DIR ?? '.pglite/dev'
  const db = createPgliteDb(dir)
  await migrateDb(db)
  await seedStylePresets(db)

  const generator = new FixtureLLM()
  let seeded = 0
  for (const [i, fixture] of allProspectFixtures.entries()) {
    const styleKey = STYLE_ROTATION[i % STYLE_ROTATION.length]!
    const resolved = await resolveActivePreset(db, styleKey, fixture.trade)
    if (!resolved) throw new Error(`no preset for ${styleKey}/${fixture.trade}`)

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
        extractedProfile: fixture.facts,
      })
      .onConflictDoNothing()
      .returning()
    if (!prospect) continue

    await generateSiteVersion({
      db,
      generator,
      prospectId: prospect.id,
      facts: fixture.facts,
      preset: resolved.preset,
      stylePresetId: resolved.presetId,
      slug: fixture.key,
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
