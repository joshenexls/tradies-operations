import { allProspectFixtures, getFixture } from '@tradies/fixtures'
import type { StylePreset } from '@tradies/site-spec'
import {
  siteSpecSchema,
  stylePresetSchema,
  validateSpecAgainstFacts,
  validateSpecAgainstPreset,
} from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import { FixtureLLM } from './fixture-llm'

const NOW = new Date('2026-07-01')

const presetA: StylePreset = stylePresetSchema.parse({
  styleKey: 'modern',
  name: 'Modern',
  trade: null,
  templateId: 'trade-modern',
  paletteId: 'navy-brass',
  fontPairId: 'archivo-inter',
  radius: 'soft',
  variantWeights: {
    hero: { split: 0.7, overlay: 0.3 },
    services: { cards: 1 },
    faq: { accordion: 1 },
  },
  imageryPool: 'general-modern',
  tone: 'friendly',
  status: 'active',
})

const presetB: StylePreset = stylePresetSchema.parse({
  styleKey: 'heritage',
  name: 'Heritage',
  trade: null,
  templateId: 'trade-heritage',
  paletteId: 'brick-slate',
  fontPairId: 'fraunces-source',
  radius: 'sharp',
  variantWeights: {
    hero: { classic: 1 },
    services: { list: 0.5, grid: 0.5 },
    about: { story: 1 },
    contact: { banner: 1 },
  },
  imageryPool: 'general-heritage',
  tone: 'premium',
  status: 'active',
})

const generator = new FixtureLLM()

describe('FixtureLLM', () => {
  for (const preset of [presetA, presetB]) {
    describe(`preset "${preset.styleKey}"`, () => {
      for (const fixture of allProspectFixtures) {
        it(`produces a valid, grounded, preset-conformant spec for ${fixture.key}`, async () => {
          const result = await generator.generateSiteSpec({ facts: fixture.facts, preset })

          const parsed = siteSpecSchema.safeParse(result.candidate)
          expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(true)
          if (!parsed.success) return

          const factReport = validateSpecAgainstFacts(parsed.data, { now: NOW })
          expect(factReport.violations).toEqual([])
          expect(factReport.ok).toBe(true)

          const presetReport = validateSpecAgainstPreset(parsed.data, preset)
          expect(presetReport.violations).toEqual([])
          expect(presetReport.ok).toBe(true)
        })
      }
    })
  }

  it('is deterministic: the same input twice yields deep-equal candidates', async () => {
    for (const fixture of allProspectFixtures) {
      const first = await generator.generateSiteSpec({ facts: fixture.facts, preset: presetA })
      const second = await generator.generateSiteSpec({ facts: fixture.facts, preset: presetA })
      expect(second).toEqual(first)
    }
  })

  it('gives different businesses different headlines', async () => {
    const swift = await generator.generateSiteSpec({
      facts: getFixture('leeds-plumber-swift').facts,
      preset: presetA,
    })
    const hallam = await generator.generateSiteSpec({
      facts: getFixture('sheffield-electrician-hallam').facts,
      preset: presetA,
    })
    const heroOf = (candidate: unknown) => {
      const spec = siteSpecSchema.parse(candidate)
      const hero = spec.sections[0]
      if (hero?.kind !== 'hero') throw new Error('expected hero first')
      return hero
    }
    expect(heroOf(swift.candidate).headline).not.toBe(heroOf(hallam.candidate).headline)
  })

  it('honours "shorter headline" feedback', async () => {
    const facts = getFixture('leeds-plumber-swift').facts
    const before = await generator.generateSiteSpec({ facts, preset: presetA })
    const after = await generator.generateSiteSpec({
      facts,
      preset: presetA,
      feedback: 'Shorter headline please, it wraps on mobile',
    })
    const headline = (candidate: unknown) => {
      const spec = siteSpecSchema.parse(candidate)
      const hero = spec.sections[0]
      if (hero?.kind !== 'hero') throw new Error('expected hero first')
      return hero.headline
    }
    expect(headline(after.candidate).length).toBeLessThan(headline(before.candidate).length)
    // the rest of the spec keeps validating
    const spec = siteSpecSchema.parse(after.candidate)
    expect(validateSpecAgainstFacts(spec, { now: NOW }).ok).toBe(true)
  })

  it('omits the trust section when no accreditations are evidenced', async () => {
    const facts = getFixture('nottingham-plumber-castle').facts
    expect(facts.accreditations).toHaveLength(0)
    const result = await generator.generateSiteSpec({ facts, preset: presetA })
    const spec = siteSpecSchema.parse(result.candidate)
    expect(spec.sections.some((s) => s.kind === 'trust')).toBe(false)
    const hero = spec.sections[0]
    if (hero?.kind === 'hero') expect(hero.badges).toEqual([])
  })

  it('pads sparse fixtures up to three service items with generic titles', async () => {
    const facts = getFixture('leeds-roofer-aire').facts
    expect(facts.services.length).toBeLessThan(3)
    const result = await generator.generateSiteSpec({ facts, preset: presetB })
    const spec = siteSpecSchema.parse(result.candidate)
    const services = spec.sections.find((s) => s.kind === 'services')
    expect(services?.kind).toBe('services')
    if (services?.kind === 'services') expect(services.items.length).toBeGreaterThanOrEqual(3)
  })

  it('reports a model id and plausible usage', async () => {
    const result = await generator.generateSiteSpec({
      facts: getFixture('york-heating-minster').facts,
      preset: presetA,
    })
    expect(result.model).toBe('fixture-llm-v1')
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  })
})
