import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { events, prospects, siteSpecs, sites } from '@tradies/db'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { getFixture } from '@tradies/fixtures'
import { FixtureLLM, type GenerationInput, type SiteSpecGenerator } from '@tradies/llm'
import { SEED_STYLE_PRESETS } from '@tradies/templates'
import { resolveStylePreset } from '@tradies/site-spec'
import { GenerationFailedError, generateSiteVersion } from './generate-site-version'
import { prospectToFacts } from './facts'
import { resolveActivePreset, seedStylePresets } from './presets'

const fixture = getFixture('leeds-plumber-swift')
const preset = resolveStylePreset(SEED_STYLE_PRESETS, 'modern', 'plumber')!

async function insertProspect(db: TestDb) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      businessName: fixture.businessName,
      city: fixture.town,
      trade: fixture.trade,
      source: 'manual',
      status: 'generating',
      phone: fixture.overture.phone ?? null,
      extractedProfile: fixture.facts,
    })
    .returning()
  return prospect!
}

/** Wraps FixtureLLM but corrupts the first N attempts. */
class FlakyGenerator implements SiteSpecGenerator {
  constructor(
    private badAttempts: number,
    private corrupt: (candidate: Record<string, unknown>) => void,
  ) {}
  attempts = 0
  feedbacks: (string | undefined)[] = []
  private inner = new FixtureLLM()

  async generateSiteSpec(input: GenerationInput) {
    this.attempts++
    this.feedbacks.push(input.feedback)
    const result = await this.inner.generateSiteSpec({ ...input, feedback: undefined })
    if (this.attempts <= this.badAttempts) {
      const candidate = structuredClone(result.candidate) as Record<string, unknown>
      this.corrupt(candidate)
      return { ...result, candidate }
    }
    return result
  }
}

describe('generateSiteVersion', () => {
  let db: TestDb
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('persists a valid spec, site row and event on first attempt', async () => {
    const prospect = await insertProspect(db)
    const result = await generateSiteVersion({
      db,
      generator: new FixtureLLM(),
      prospectId: prospect.id,
      facts: prospectToFacts(prospect),
      preset,
      costRates: { inputMicroGbp: 2, outputMicroGbp: 10 },
    })
    expect(result.version).toBe(1)
    expect(result.attempts).toBe(1)
    const specRows = await db.select().from(siteSpecs).where(eq(siteSpecs.prospectId, prospect.id))
    expect(specRows).toHaveLength(1)
    expect(specRows[0]!.validationReport?.fact.ok).toBe(true)
    const [site] = await db.select().from(sites).where(eq(sites.prospectId, prospect.id))
    expect(site?.currentSpecVersion).toBe(1)
    expect(site?.noindex).toBe(true)
    expect(site?.previewExpiresAt).toBeInstanceOf(Date)
    const eventRows = await db.select().from(events).where(eq(events.prospectId, prospect.id))
    expect(eventRows.some((e) => e.type === 'spec_generated')).toBe(true)
  })

  it('repairs a design-system violation and feeds the violation back to the generator', async () => {
    const prospect = await insertProspect(db)
    const generator = new FlakyGenerator(1, (candidate) => {
      // palette drift — violates the preset, not the schema
      ;(candidate.theme as Record<string, unknown>).paletteId = 'navy-brass'
    })
    const result = await generateSiteVersion({
      db,
      generator,
      prospectId: prospect.id,
      facts: prospectToFacts(prospect),
      preset,
      costRates: { inputMicroGbp: 1, outputMicroGbp: 1 },
    })
    expect(result.attempts).toBe(2)
    expect(generator.feedbacks[1]).toContain('design system')
    expect(generator.feedbacks[1]).toContain('palette')
  })

  it('repairs a schema violation (zod) the same way', async () => {
    const prospect = await insertProspect(db)
    const generator = new FlakyGenerator(1, (candidate) => {
      delete candidate.seo
    })
    const result = await generateSiteVersion({
      db,
      generator,
      prospectId: prospect.id,
      facts: prospectToFacts(prospect),
      preset,
    })
    expect(result.attempts).toBe(2)
    expect(generator.feedbacks[1]).toContain('schema')
  })

  it('gives up after maxAttempts with a generation_failed event and no spec row', async () => {
    const prospect = await insertProspect(db)
    const generator = new FlakyGenerator(99, (candidate) => {
      delete candidate.sections
    })
    await expect(
      generateSiteVersion({
        db,
        generator,
        prospectId: prospect.id,
        facts: prospectToFacts(prospect),
        preset,
        maxAttempts: 3,
      }),
    ).rejects.toBeInstanceOf(GenerationFailedError)
    expect(generator.attempts).toBe(3)
    const specRows = await db.select().from(siteSpecs).where(eq(siteSpecs.prospectId, prospect.id))
    expect(specRows).toHaveLength(0)
    const eventRows = await db.select().from(events).where(eq(events.prospectId, prospect.id))
    expect(eventRows.some((e) => e.type === 'generation_failed')).toBe(true)
  })

  it('increments versions and keeps the site slug on regeneration', async () => {
    const prospect = await insertProspect(db)
    const base = {
      db,
      generator: new FixtureLLM(),
      prospectId: prospect.id,
      facts: prospectToFacts(prospect),
      preset,
    }
    const first = await generateSiteVersion(base)
    const second = await generateSiteVersion({ ...base, feedback: 'shorter headline' })
    expect(second.version).toBe(2)
    expect(second.slug).toBe(first.slug)
    const [site] = await db.select().from(sites).where(eq(sites.prospectId, prospect.id))
    expect(site?.currentSpecVersion).toBe(2)
  })

  it('seeds and resolves presets from the DB library (system × trade)', async () => {
    await seedStylePresets(db)
    await seedStylePresets(db) // idempotent
    const resolved = await resolveActivePreset(db, 'modern', 'plumber')
    expect(resolved?.preset.imageryPool).toBe('plumbing-modern')
    const generic = await resolveActivePreset(db, 'modern', 'roofer')
    expect(generic?.preset.trade).toBeNull()
    expect(await resolveActivePreset(db, 'nonexistent', 'plumber')).toBeUndefined()
  })

  it('records one cost row per attempt', async () => {
    const prospect = await insertProspect(db)
    const generator = new FlakyGenerator(1, (candidate) => {
      delete candidate.seo
    })
    await generateSiteVersion({
      db,
      generator,
      prospectId: prospect.id,
      facts: prospectToFacts(prospect),
      preset,
      costRates: { inputMicroGbp: 1, outputMicroGbp: 1 },
    })
    const costs = await db.query.prospectCosts.findMany({
      where: (t, { eq: eqOp }) => eqOp(t.prospectId, prospect.id),
    })
    expect(costs).toHaveLength(2)
    expect(costs.every((c) => c.category === 'llm')).toBe(true)
  })
})
