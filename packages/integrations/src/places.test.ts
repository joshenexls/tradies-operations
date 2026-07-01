import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import { FixturePlacesClient, toPlacesSafeResult } from './places'
import type { CostEntry } from './types'

describe('toPlacesSafeResult — the containment boundary', () => {
  it('keeps exactly placeId, hasWebsite and isFacebookOnly at runtime', () => {
    const result = toPlacesSafeResult({
      placeId: 'fx-place-x',
      websiteUri: 'https://example.example',
    })
    expect(Object.keys(result).sort()).toEqual(['hasWebsite', 'isFacebookOnly', 'placeId'])
  })

  it('never lets Places content through the type system', () => {
    const result = toPlacesSafeResult({ placeId: 'fx-place-x' })
    // @ts-expect-error business names are not representable (GMP ToS 3.2.3)
    void result.name
    // @ts-expect-error phones are not representable — dial-time fetch only
    void result.phone
    // @ts-expect-error ratings/reviews are not representable
    void result.rating
    expect(result.placeId).toBe('fx-place-x')
  })

  it('treats a real website as hasWebsite', () => {
    const result = toPlacesSafeResult({
      placeId: 'p',
      websiteUri: 'https://swiftflowplumbing.example',
    })
    expect(result.hasWebsite).toBe(true)
    expect(result.isFacebookOnly).toBe(false)
  })

  it('treats facebook.com and instagram.com as no real website', () => {
    for (const uri of [
      'https://www.facebook.com/airevalleyroofing',
      'https://facebook.com/somebody',
      'https://www.instagram.com/somebody',
      'https://m.facebook.com/somebody',
    ]) {
      const result = toPlacesSafeResult({ placeId: 'p', websiteUri: uri })
      expect(result.hasWebsite, uri).toBe(false)
      expect(result.isFacebookOnly, uri).toBe(true)
    }
  })

  it('does not flag lookalike domains as facebook-only', () => {
    const result = toPlacesSafeResult({
      placeId: 'p',
      websiteUri: 'https://notfacebook.example.com',
    })
    expect(result.hasWebsite).toBe(true)
    expect(result.isFacebookOnly).toBe(false)
  })

  it('treats a missing/null websiteUri as no website', () => {
    for (const websiteUri of [undefined, null]) {
      const result = toPlacesSafeResult({ placeId: 'p', websiteUri })
      expect(result.hasWebsite).toBe(false)
      expect(result.isFacebookOnly).toBe(false)
    }
  })
})

describe('FixturePlacesClient', () => {
  it('searches by city and trade, returning only safe results', async () => {
    const client = new FixturePlacesClient()
    const results = await client.searchTrade({ city: 'Leeds', trade: 'plumber' })
    expect(results.length).toBeGreaterThan(0)
    expect(results.map((r) => r.placeId)).toContain('fx-place-leeds-plumber-swift')
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(['hasWebsite', 'isFacebookOnly', 'placeId'])
    }
  })

  it('derives flags matching the fixture story', async () => {
    const client = new FixturePlacesClient()
    const roofers = await client.searchTrade({ city: 'Leeds', trade: 'roofer' })
    const aire = roofers.find((r) => r.placeId === 'fx-place-leeds-roofer-aire')
    expect(aire?.isFacebookOnly).toBe(true)
    expect(aire?.hasWebsite).toBe(false)
  })

  it('matches the city case-insensitively', async () => {
    const client = new FixturePlacesClient()
    const results = await client.searchTrade({ city: 'leeds', trade: 'plumber' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('fetches the phone ephemerally by place id', async () => {
    const client = new FixturePlacesClient()
    const phone = await client.fetchPhoneEphemeral('fx-place-leeds-plumber-swift')
    expect(phone).toBe(getFixture('leeds-plumber-swift').facts.phone?.value)
    expect(await client.fetchPhoneEphemeral('fx-place-does-not-exist')).toBeNull()
  })

  it('records a cost per request', async () => {
    const entries: CostEntry[] = []
    const client = new FixturePlacesClient({ recordCost: (e) => entries.push(e) })
    await client.searchTrade({ city: 'Leeds', trade: 'plumber' })
    await client.fetchPhoneEphemeral('fx-place-leeds-plumber-swift')
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      expect(entry.category).toBe('places')
      expect(entry.units).toBe(1)
      expect(entry.amountMicroGbp).toBeGreaterThan(0)
    }
  })
})
