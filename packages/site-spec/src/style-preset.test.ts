import { describe, expect, it } from 'vitest'
import {
  presetConstraints,
  resolveStylePreset,
  stylePresetSchema,
  validateSpecAgainstPreset,
} from './style-preset'
import type { StylePreset } from './style-preset'

const modernGeneric: StylePreset = stylePresetSchema.parse({
  styleKey: 'modern',
  name: 'Modern',
  trade: null,
  templateId: 'modern',
  paletteId: 'graphite-amber',
  fontPairId: 'sora-inter',
  radius: 'soft',
  variantWeights: { hero: { split: 0.7, overlay: 0.3, classic: 0 } },
  imageryPool: 'trades-generic-modern',
  tone: 'professional',
  status: 'active',
})

const modernPlumber: StylePreset = stylePresetSchema.parse({
  ...modernGeneric,
  trade: 'plumber',
  imageryPool: 'plumbing-modern',
})

describe('resolveStylePreset (system × trade selection)', () => {
  it('prefers the trade specialisation when one exists', () => {
    const resolved = resolveStylePreset([modernGeneric, modernPlumber], 'modern', 'plumber')
    expect(resolved?.imageryPool).toBe('plumbing-modern')
  })

  it('falls back to the generic system for other trades', () => {
    const resolved = resolveStylePreset([modernGeneric, modernPlumber], 'modern', 'roofer')
    expect(resolved?.imageryPool).toBe('trades-generic-modern')
  })

  it('ignores retired presets', () => {
    const retired = { ...modernPlumber, status: 'retired' as const }
    const resolved = resolveStylePreset([modernGeneric, retired], 'modern', 'plumber')
    expect(resolved?.trade).toBeNull()
  })

  it('returns undefined for unknown style keys', () => {
    expect(resolveStylePreset([modernGeneric], 'brutalist', 'plumber')).toBeUndefined()
  })
})

describe('presetConstraints', () => {
  it('filters out zero-weight variants and keeps unspecified kinds fully open', () => {
    const constraints = presetConstraints(modernGeneric)
    expect(constraints.allowedVariants.hero).toEqual(['split', 'overlay'])
    expect(constraints.allowedVariants.services).toEqual(['grid', 'cards', 'list'])
  })
})

describe('validateSpecAgainstPreset', () => {
  it('flags palette drift and disallowed variants', () => {
    const result = validateSpecAgainstPreset(
      {
        templateId: 'classic',
        theme: { paletteId: 'navy-brass', fontPairId: 'sora-inter' },
        sections: [
          { kind: 'hero', variant: 'classic' },
          { kind: 'contact', variant: 'banner' },
        ],
      },
      modernGeneric,
    )
    expect(result.ok).toBe(false)
    expect(result.violations.join(' ')).toContain('palette')
    expect(result.violations.join(' ')).toContain('hero')
    expect(result.violations.join(' ')).toContain('template')
  })

  it('passes a conforming spec', () => {
    const result = validateSpecAgainstPreset(
      {
        templateId: 'modern',
        theme: { paletteId: 'graphite-amber', fontPairId: 'sora-inter' },
        sections: [
          { kind: 'hero', variant: 'split' },
          { kind: 'contact', variant: 'split-form' },
        ],
      },
      modernGeneric,
    )
    expect(result.ok).toBe(true)
  })
})
