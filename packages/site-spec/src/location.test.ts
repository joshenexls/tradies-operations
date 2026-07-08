import { describe, expect, it } from 'vitest'
import { buildGoogleReviewsUrl, buildMapsEmbedSrc, buildSiteLocation } from './location'

describe('buildMapsEmbedSrc', () => {
  it('builds a keyless embed from business name + town (+ postcode)', () => {
    const src = buildMapsEmbedSrc({ businessName: 'Swift Flow Plumbing', town: 'Leeds' })
    expect(src).toBe(
      'https://maps.google.com/maps?q=Swift%20Flow%20Plumbing%2C%20Leeds&output=embed',
    )
    expect(buildMapsEmbedSrc({ businessName: 'A&B', town: 'York', postcode: 'YO1 7HH' })).toContain(
      encodeURIComponent('A&B, York YO1 7HH'),
    )
  })

  it('prefers a full address when present', () => {
    const src = buildMapsEmbedSrc({
      businessName: 'X',
      town: 'Leeds',
      address: '1 High St, Leeds LS1 4AB',
    })
    expect(src).toContain(encodeURIComponent('1 High St, Leeds LS1 4AB'))
    expect(src).not.toContain('X%2C')
  })

  it('always yields the sanctioned keyless embed shape', () => {
    const src = buildMapsEmbedSrc({ businessName: 'B', town: 'T' })
    expect(src.startsWith('https://maps.google.com/maps?q=')).toBe(true)
    expect(src.endsWith('&output=embed')).toBe(true)
  })
})

describe('buildGoogleReviewsUrl', () => {
  it('points at the real listing for a place id, null otherwise', () => {
    expect(buildGoogleReviewsUrl('ChIJabc123')).toBe(
      'https://search.google.com/local/reviews?placeid=ChIJabc123',
    )
    expect(buildGoogleReviewsUrl(null)).toBeNull()
    expect(buildGoogleReviewsUrl(undefined)).toBeNull()
    expect(buildGoogleReviewsUrl('   ')).toBeNull()
  })

  it('never emits a rating or review claim — only a link', () => {
    const url = buildGoogleReviewsUrl('ChIJabc123')!
    expect(url).not.toMatch(/star|rating|\d\s*\/\s*5/i)
  })
})

describe('buildSiteLocation', () => {
  it('assembles map (always) + reviews (place-id-gated)', () => {
    const withPlace = buildSiteLocation({
      businessName: 'Swift Flow',
      town: 'Leeds',
      placeId: 'ChIJxyz',
    })
    expect(withPlace.mapsEmbedSrc).toContain('output=embed')
    expect(withPlace.reviewsUrl).toContain('ChIJxyz')

    const manual = buildSiteLocation({ businessName: 'Manual Co', town: 'Hull' })
    expect(manual.mapsEmbedSrc).toContain('output=embed') // map still renders
    expect(manual.reviewsUrl).toBeNull() // CTA hidden without a listing
  })
})
