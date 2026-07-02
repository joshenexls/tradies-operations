/**
 * Seeds the local PGlite database exactly like apps/sites (deterministic
 * slugs = fixture keys), PLUS one review batch containing pending 'site'
 * review requests for the first five prospects — the ops e2e suite depends
 * on that batch. Run while any dev server on the same PGLITE_DIR is STOPPED —
 * PGlite is single-process.
 *
 *   pnpm --filter @tradies/ops seed
 */
import { createPgliteDb } from '@tradies/db'
import { migrateDb } from '@tradies/db/migrate'
import { prospects, reviewBatches, reviewRequests } from '@tradies/db/schema'
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
  const seededProspectIds: string[] = []
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
        websiteHealthScore: fixture.psi?.performance ?? null,
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
    seededProspectIds.push(prospect.id)
  }

  // Fixture review batch (first 5 prospects) — the e2e suite depends on it
  const reviewIds = seededProspectIds.slice(0, 5)
  if (reviewIds.length > 0) {
    const [batch] = await db
      .insert(reviewBatches)
      .values({ label: 'Fixture batch', city: 'Leeds', autoApprove: false, status: 'open' })
      .returning()
    if (!batch) throw new Error('failed to create the fixture review batch')
    for (const prospectId of reviewIds) {
      await db
        .insert(reviewRequests)
        .values({ batchId: batch.id, prospectId, kind: 'site', status: 'pending' })
    }
  }

  console.log(
    `Seeded ${seededProspectIds.length} fixture sites (+ review batch of ${reviewIds.length}) into ${dir}`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
