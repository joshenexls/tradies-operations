import { getFixture } from '@tradies/fixtures'
import { presetConstraints, stylePresetSchema } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import { buildSiteSpecPrompt } from './site-spec-v1'

const preset = stylePresetSchema.parse({
  styleKey: 'modern',
  name: 'Modern',
  trade: 'plumber',
  templateId: 'trade-modern',
  paletteId: 'deep-teal',
  fontPairId: 'sora-inter',
  variantWeights: { hero: { overlay: 1 }, services: { cards: 0.6, grid: 0.4 } },
  preferredSections: ['hero', 'services', 'about', 'contact'],
  imageryPool: 'plumbing-modern',
  tone: 'no-nonsense',
})

describe('buildSiteSpecPrompt', () => {
  const facts = getFixture('leeds-plumber-swift').facts
  const constraints = presetConstraints(preset)

  it('is versioned site-spec-v1', () => {
    const prompt = buildSiteSpecPrompt({ facts, constraints })
    expect(prompt.version).toBe('site-spec-v1')
  })

  it('carries the facts values into the prompt', () => {
    const prompt = buildSiteSpecPrompt({ facts, constraints })
    const text = `${prompt.system}\n${prompt.user}`
    expect(text).toContain('Swift Flow Plumbing')
    expect(text).toContain('Leeds')
    expect(text).toContain('Boiler repairs')
    expect(text).toContain('0113 496 0721')
    expect(text).toContain('watersafe')
  })

  it('carries the design constraints into the system prompt', () => {
    const prompt = buildSiteSpecPrompt({ facts, constraints })
    expect(prompt.system).toContain('trade-modern')
    expect(prompt.system).toContain('deep-teal')
    expect(prompt.system).toContain('sora-inter')
    expect(prompt.system).toContain('plumbing-modern')
    // only variants the preset allows are offered
    expect(prompt.system).toContain('hero: overlay')
    expect(prompt.system).toContain('services: grid, cards')
    expect(prompt.system).toContain('hero, services, about, contact')
  })

  it('states the tone and the non-negotiables', () => {
    const prompt = buildSiteSpecPrompt({ facts, constraints })
    expect(prompt.system).toContain('no-nonsense')
    expect(prompt.system).toContain('UK English')
    expect(prompt.system.toLowerCase()).toContain('testimonial')
    expect(prompt.system.toLowerCase()).toContain('never invent')
  })

  it('includes operator feedback when present and omits it otherwise', () => {
    const withFeedback = buildSiteSpecPrompt({
      facts,
      constraints,
      feedback: 'Shorter headline and warmer intro',
    })
    expect(withFeedback.user).toContain('Shorter headline and warmer intro')
    const without = buildSiteSpecPrompt({ facts, constraints })
    expect(without.user).not.toContain('Operator feedback')
  })
})
