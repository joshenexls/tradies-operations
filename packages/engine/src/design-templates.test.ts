import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { designTemplates, stylePresets } from '@tradies/db'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { allDesignTemplateFixtures, craftsmanDark } from '@tradies/fixtures'
import { ingestFixtureDesignTemplate, seedDesignTemplates } from './design-templates'
import { resolveActivePreset } from './presets'

describe('ingestFixtureDesignTemplate', () => {
  it('every shipped fixture survives the real sanitize → annotate → validate path', () => {
    for (const fixture of allDesignTemplateFixtures) {
      const ingested = ingestFixtureDesignTemplate(fixture)
      expect(ingested.validationReport.ok).toBe(true)
      expect(ingested.manifest.slots.map((s) => s.id).sort()).toEqual(
        [...fixture.expectedSlotIds].sort(),
      )
      expect(ingested.manifest.repeats.map((r) => r.id).sort()).toEqual(
        [...fixture.expectedRepeatIds].sort(),
      )
      expect(ingested.manifest.strippedRegions.map((r) => r.reason).sort()).toEqual(
        [...fixture.expectedStrippedReasons].sort(),
      )
    }
  })

  it('strips external + exfiltrating scripts and dummy testimonials from craftsman-dark', () => {
    const ingested = ingestFixtureDesignTemplate(craftsmanDark)
    const report = JSON.stringify(ingested.sanitizationReport)
    expect(report).toMatch(/script/i)
    expect(ingested.annotatedHtml).not.toContain('<script src=')
    expect(ingested.annotatedHtml).not.toContain('fetch(')
    // DMCC: the lander's dummy testimonials must not survive ingest
    expect(ingested.annotatedHtml.toLowerCase()).not.toContain('testimonial')
    expect(ingested.tokens.palette.length).toBeGreaterThan(0)
  })
})

describe('seedDesignTemplates', () => {
  let db: TestDb
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('seeds one active template + one generic html preset per fixture, idempotently', async () => {
    await seedDesignTemplates(db)
    await seedDesignTemplates(db) // idempotent

    const templates = await db.select().from(designTemplates)
    expect(templates).toHaveLength(allDesignTemplateFixtures.length)
    expect(templates.every((t) => t.status === 'active')).toBe(true)
    expect(templates.every((t) => t.annotatedHtml && t.slotManifest && t.sampleTexts)).toBe(true)

    const presets = await db.select().from(stylePresets).where(eq(stylePresets.kind, 'html'))
    expect(presets).toHaveLength(allDesignTemplateFixtures.length)
    for (const preset of presets) {
      expect(preset.trade).toBeNull()
      expect(preset.templateId).toBe('html')
      expect(preset.designTemplateId).toBeTruthy()
    }
  })

  it('html presets resolve through the same library lookup as component ones', async () => {
    await seedDesignTemplates(db)
    const resolved = await resolveActivePreset(db, 'craftsman-dark', 'plumber')
    expect(resolved).toBeDefined()
    expect(resolved!.preset.kind).toBe('html')
    expect(resolved!.preset.designTemplateId).toBeTruthy()
    // generic row: any trade resolves to it
    const roofer = await resolveActivePreset(db, 'craftsman-dark', 'roofer')
    expect(roofer?.presetId).toBe(resolved!.presetId)
  })
})
