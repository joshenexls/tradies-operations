import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { designTemplates, stylePresets } from '@tradies/db/schema'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { resolveActivePreset } from '@tradies/engine'
import { craftsmanDark } from '@tradies/fixtures'
import { FixtureTemplateIngestor, type TemplateIngestor } from '@tradies/llm'
import { activateTemplate, ingestTemplate, reingestTemplate, retireTemplate } from './templates'

/**
 * The full operator upload path on the real migrations: sanitize → annotate
 * (fixture ingestor) → validate → draft rows; activate/retire lifecycle; the
 * repair loop exhausting on a DMCC violation (unstripped testimonials) writes
 * nothing. One PGlite per file; every test uses its own styleKey.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

/** The good path: the empty-map fixture ingestor html-matches craftsmanDark. */
function input(styleKey: string) {
  return {
    name: craftsmanDark.name,
    rawHtml: craftsmanDark.html,
    componentsHtml: craftsmanDark.componentsHtml,
    styleKey,
    trade: null,
    imageryPool: 'trades-heritage',
    tone: 'premium' as const,
    createdBy: 'operator',
  }
}

const explodingIngestor: TemplateIngestor = {
  annotate: async () => {
    throw new Error('ingestor must not be called for this input')
  },
}

describe('ingestTemplate', () => {
  it('creates a draft template + draft preset with the derived manifest', async () => {
    const result = await ingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      input: input('cd-ingest'),
    })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected ok')

    const [template] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, result.templateId))
    expect(template?.status).toBe('draft')
    expect(template?.rawHtml).toBe(craftsmanDark.html)
    expect(template?.componentsHtml).toBe(craftsmanDark.componentsHtml ?? null)
    expect(template?.slotManifest?.slots.map((s) => s.id).sort()).toEqual(
      [...craftsmanDark.expectedSlotIds].sort(),
    )
    expect(template?.slotManifest?.repeats.map((r) => r.id).sort()).toEqual(
      [...craftsmanDark.expectedRepeatIds].sort(),
    )
    expect(template?.slotManifest?.strippedRegions.map((r) => r.reason).sort()).toEqual(
      [...craftsmanDark.expectedStrippedReasons].sort(),
    )
    expect(template?.validationReport).toMatchObject({ ok: true })
    expect(template?.ingestModel).toBe('fixture-ingestor-v1')
    expect(template?.ingestUsage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(template?.tokens?.palette.length).toBeGreaterThan(0)

    // DMCC: the lander's dummy testimonials must not survive ingest,
    // and the sanitizer report is the operator's trust surface for scripts
    expect(template?.annotatedHtml?.toLowerCase()).not.toContain('testimonial')
    expect(JSON.stringify(template?.sanitizationReport)).toMatch(/script|analytics/i)

    const [preset] = await db
      .select()
      .from(stylePresets)
      .where(eq(stylePresets.id, result.presetId))
    expect(preset).toMatchObject({
      styleKey: 'cd-ingest',
      trade: null,
      status: 'draft',
      kind: 'html',
      templateId: 'html',
      paletteId: 'graphite-amber',
      fontPairId: 'manrope-manrope',
      imageryPool: 'trades-heritage',
      tone: 'premium',
      designTemplateId: result.templateId,
    })
  })

  it('exhausts the repair loop and writes NOTHING when the testimonials strip is missing', async () => {
    // a doctored ingestor that "forgot" every strip op — validation must catch
    // the review-shaped dummy copy, and 3 attempts of the same ops can't fix it
    const doctored = new FixtureTemplateIngestor({
      [craftsmanDark.name]: {
        ops: craftsmanDark.annotations.filter((op) => op.op !== 'strip'),
      },
    })
    const templatesBefore = (await db.select().from(designTemplates)).length
    const presetsBefore = (await db.select().from(stylePresets)).length

    const result = await ingestTemplate({ db, ingestor: doctored, input: input('cd-nostrip') })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.code).toBe('ingest-failed')
    expect(result.attempts).toBe(3)
    expect(result.problems.join('\n')).toMatch(/review-shaped/i)
    expect(result.sanitizationReport).not.toBeNull()

    expect((await db.select().from(designTemplates)).length).toBe(templatesBefore)
    expect((await db.select().from(stylePresets)).length).toBe(presetsBefore)
  })

  it('reports schema-invalid ops as problems and never applies them', async () => {
    const doctored = new FixtureTemplateIngestor({
      'Tiny Lander': { ops: [{ op: 'slot', selector: 'h1', id: 'x', kind: 'not-a-kind' }] },
    })
    const result = await ingestTemplate({
      db,
      ingestor: doctored,
      input: {
        ...input('cd-badops'),
        name: 'Tiny Lander',
        rawHtml: '<html><head><title>t</title></head><body><h1>Hello</h1></body></html>',
        componentsHtml: undefined,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.attempts).toBe(3)
    expect(result.problems.join('\n')).toMatch(/failed schema/)
  })

  it('rejects an oversized upload before the ingestor ever runs', async () => {
    // explicit cap
    const capped = await ingestTemplate({
      db,
      ingestor: explodingIngestor,
      input: { ...input('cd-size'), rawHtml: `<html>${'a'.repeat(4096)}</html>` },
      maxUploadKb: 2,
    })
    expect(capped).toMatchObject({ ok: false, code: 'too-large' })

    // default TEMPLATE_MAX_UPLOAD_KB = 512
    const oversized = await ingestTemplate({
      db,
      ingestor: explodingIngestor,
      input: { ...input('cd-size'), rawHtml: `<html>${'a'.repeat(513 * 1024)}</html>` },
    })
    expect(oversized).toMatchObject({ ok: false, code: 'too-large' })
    expect((oversized as { attempts: number }).attempts).toBe(0)
  })

  it('rolls the template back when the styleKey+trade already exists', async () => {
    const first = await ingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      input: input('cd-conflict'),
    })
    expect(first).toMatchObject({ ok: true })
    const templatesBefore = (await db.select().from(designTemplates)).length

    const second = await ingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      input: input('cd-conflict'),
    })
    expect(second).toMatchObject({ ok: false, code: 'style-key-conflict' })
    expect((await db.select().from(designTemplates)).length).toBe(templatesBefore)
  })
})

describe('activateTemplate / retireTemplate', () => {
  it('activate flips template + preset live so preset resolution finds it; retire hides it', async () => {
    const ingested = await ingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      input: input('cd-lifecycle'),
    })
    if (!ingested.ok) throw new Error('expected ok')

    // draft systems are invisible to generation
    expect(await resolveActivePreset(db, 'cd-lifecycle', 'plumber')).toBeUndefined()

    expect(await activateTemplate(db, ingested.templateId)).toMatchObject({ ok: true })
    expect(await activateTemplate(db, ingested.templateId)).toMatchObject({ ok: true }) // idempotent

    const resolved = await resolveActivePreset(db, 'cd-lifecycle', 'plumber')
    expect(resolved?.presetId).toBe(ingested.presetId)
    expect(resolved?.preset.kind).toBe('html')
    const [activeTemplate] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, ingested.templateId))
    expect(activeTemplate?.status).toBe('active')

    expect(await retireTemplate(db, ingested.templateId)).toMatchObject({ ok: true })
    expect(await retireTemplate(db, ingested.templateId)).toMatchObject({ ok: true }) // idempotent
    expect(await resolveActivePreset(db, 'cd-lifecycle', 'plumber')).toBeUndefined()
    const [retired] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, ingested.templateId))
    expect(retired?.status).toBe('retired')
    const [retiredPreset] = await db
      .select()
      .from(stylePresets)
      .where(eq(stylePresets.id, ingested.presetId))
    expect(retiredPreset?.status).toBe('retired')
  })

  it('refuses to activate a template without a passing validation report', async () => {
    const result = await activateTemplate(db, '00000000-0000-4000-8000-000000000000')
    expect(result).toMatchObject({ error: 'Template not found' })
  })
})

describe('reingestTemplate', () => {
  it('keeps an active template active when the re-run validates', async () => {
    const ingested = await ingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      input: input('cd-reingest'),
    })
    if (!ingested.ok) throw new Error('expected ok')
    await activateTemplate(db, ingested.templateId)

    const result = await reingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      templateId: ingested.templateId,
    })
    expect(result).toMatchObject({ ok: true })
    const [row] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, ingested.templateId))
    expect(row?.status).toBe('active')
    expect(row?.validationReport).toMatchObject({ ok: true })
  })

  it('flips an active template (and its presets) to draft when the re-run fails, recording why', async () => {
    const ingested = await ingestTemplate({
      db,
      ingestor: new FixtureTemplateIngestor(),
      input: input('cd-reingest-fail'),
    })
    if (!ingested.ok) throw new Error('expected ok')
    await activateTemplate(db, ingested.templateId)

    const doctored = new FixtureTemplateIngestor({
      [craftsmanDark.name]: {
        ops: craftsmanDark.annotations.filter((op) => op.op !== 'strip'),
      },
    })
    const result = await reingestTemplate({
      db,
      ingestor: doctored,
      templateId: ingested.templateId,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.problems.join('\n')).toMatch(/review-shaped/i)

    const [row] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, ingested.templateId))
    expect(row?.status).toBe('draft')
    expect(row?.validationReport?.ok).toBe(false)
    expect(row?.validationReport?.problems.join('\n')).toMatch(/review-shaped/i)
    const [preset] = await db
      .select()
      .from(stylePresets)
      .where(eq(stylePresets.id, ingested.presetId))
    expect(preset?.status).toBe('draft')

    // the untrusted template can no longer be activated until a clean re-ingest
    const activation = await activateTemplate(db, ingested.templateId)
    expect(activation).toMatchObject({
      error: expect.stringContaining('validation') as unknown,
    })
  })
})
