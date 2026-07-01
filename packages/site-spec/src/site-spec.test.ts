import { describe, expect, it } from 'vitest'
import { safeParseSiteSpec } from './site-spec'
import { makeValidSpecInput } from './test-helpers'

describe('siteSpecSchema', () => {
  it('accepts a complete valid spec', () => {
    const result = safeParseSiteSpec(makeValidSpecInput())
    expect(result.success).toBe(true)
  })

  it('rejects a spec whose first section is not the hero', () => {
    const input = makeValidSpecInput()
    input.sections = [...input.sections].reverse()
    const result = safeParseSiteSpec(input)
    expect(result.success).toBe(false)
  })

  it('rejects a spec without a trailing contact section', () => {
    const input = makeValidSpecInput()
    input.sections = input.sections.slice(0, -1)
    const result = safeParseSiteSpec(input)
    expect(result.success).toBe(false)
  })

  it('rejects duplicate section kinds', () => {
    const input = makeValidSpecInput()
    input.sections = [
      input.sections[0]!,
      input.sections[1]!,
      input.sections[1]!,
      input.sections[input.sections.length - 1]!,
    ]
    const result = safeParseSiteSpec(input)
    expect(result.success).toBe(false)
  })

  it('rejects headline copy that would overflow the layout', () => {
    const input = makeValidSpecInput()
    const hero = input.sections[0]
    if (hero && hero.kind === 'hero') hero.headline = 'x'.repeat(120)
    const result = safeParseSiteSpec(input)
    expect(result.success).toBe(false)
  })

  it('has no representation for stored review text (no testimonials section kind)', () => {
    const input = makeValidSpecInput()
    input.sections.splice(2, 0, {
      // @ts-expect-error — a testimonials section must not be representable
      kind: 'testimonials',
      variant: 'cards',
      quotes: [{ text: 'Amazing work', author: 'Dave' }],
    })
    const result = safeParseSiteSpec(input)
    expect(result.success).toBe(false)
  })
})
