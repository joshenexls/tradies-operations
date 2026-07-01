import { describe, expect, it } from 'vitest'
import { buildJsonLd } from './jsonld'
import { makeValidSpec } from './test-helpers'

describe('buildJsonLd', () => {
  it('emits a LocalBusiness subtype with services and areas', () => {
    const json = JSON.parse(buildJsonLd(makeValidSpec(), { url: 'https://example.test' }))
    expect(json['@type']).toBe('Plumber')
    expect(json.name).toBe('Smith & Sons Plumbing')
    expect(json.url).toBe('https://example.test')
    expect(json.areaServed.length).toBeGreaterThan(0)
    expect(json.hasOfferCatalog.itemListElement.length).toBe(3)
  })

  it('never emits ratings or reviews (DMCC)', () => {
    const raw = buildJsonLd(makeValidSpec())
    expect(raw).not.toContain('aggregateRating')
    expect(raw).not.toContain('"review"')
    expect(raw).not.toContain('ratingValue')
  })
})
