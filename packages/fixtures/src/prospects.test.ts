import { TRADES, businessFactsSchema } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import { allProspectFixtures, fixturesBySegment, fixturesByTrade, getFixture } from './index'

const DRAMA_PHONE = /^(0113 496 0\d{3}|0114 496 0\d{3}|0161 496 0\d{3}|07700 900\d{3})$/

describe('prospect fixtures', () => {
  it('contains exactly 20 fixtures', () => {
    expect(allProspectFixtures).toHaveLength(20)
  })

  it('has unique keys', () => {
    const keys = allProspectFixtures.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has at least one fixture per trade', () => {
    for (const trade of TRADES) {
      expect(fixturesByTrade(trade).length, `trade ${trade}`).toBeGreaterThan(0)
    }
  })

  it('every facts sheet parses businessFactsSchema', () => {
    for (const fixture of allProspectFixtures) {
      const result = businessFactsSchema.safeParse(fixture.facts)
      expect(result.success, `${fixture.key}: ${JSON.stringify(result.error?.issues)}`).toBe(true)
    }
  })

  it('facts headline fields agree with the fixture', () => {
    for (const fixture of allProspectFixtures) {
      expect(fixture.facts.businessName).toBe(fixture.businessName)
      expect(fixture.facts.trade).toBe(fixture.trade)
      expect(fixture.facts.town).toBe(fixture.town)
    }
  })

  it('every corporate fixture has an active Companies House record', () => {
    for (const fixture of allProspectFixtures) {
      if (fixture.entityType === 'corporate') {
        expect(fixture.companiesHouse, fixture.key).not.toBeNull()
        expect(fixture.companiesHouse?.status).toBe('active')
        expect(fixture.companiesHouse?.companyNumber).toMatch(/^\d{8}$/)
        expect(fixture.facts.companiesHouseNumber).toBe(fixture.companiesHouse?.companyNumber)
      } else {
        expect(fixture.companiesHouse, fixture.key).toBeNull()
      }
    }
  })

  it('every no-website fixture lacks websiteUrl, scrapeMarkdown and psi', () => {
    for (const fixture of fixturesBySegment('no_site')) {
      expect(fixture.hasWebsite, fixture.key).toBe(false)
      expect(fixture.websiteUrl, fixture.key).toBeUndefined()
      expect(fixture.scrapeMarkdown, fixture.key).toBeUndefined()
      expect(fixture.psi, fixture.key).toBeNull()
    }
  })

  it('bad-site fixtures have an http url, low PSI and scraped markdown', () => {
    const badSites = fixturesBySegment('bad_site')
    expect(badSites.length).toBeGreaterThanOrEqual(6)
    for (const fixture of badSites) {
      expect(fixture.hasWebsite, fixture.key).toBe(true)
      expect(fixture.websiteUrl, fixture.key).toMatch(/^http:\/\/.+\.example$/)
      expect(fixture.scrapeMarkdown, fixture.key).toBeTruthy()
      expect(fixture.psi?.https, fixture.key).toBe(false)
      expect(fixture.psi?.performance, fixture.key).toBeLessThan(50)
    }
  })

  it('fine fixtures have an https url and healthy PSI', () => {
    const fine = fixturesBySegment('fine')
    expect(fine.length).toBeGreaterThanOrEqual(3)
    for (const fixture of fine) {
      expect(fixture.websiteUrl, fixture.key).toMatch(/^https:\/\/.+\.example$/)
      expect(fixture.psi?.https, fixture.key).toBe(true)
      expect(fixture.psi?.performance, fixture.key).toBeGreaterThanOrEqual(80)
    }
  })

  it('facebook-only fixtures never count as having a website', () => {
    const facebookOnly = allProspectFixtures.filter((f) => f.isFacebookOnly)
    expect(facebookOnly.length).toBeGreaterThanOrEqual(2)
    for (const fixture of facebookOnly) {
      expect(fixture.hasWebsite, fixture.key).toBe(false)
      expect(fixture.places.isFacebookOnly, fixture.key).toBe(true)
    }
  })

  it('places flags mirror the fixture flags and use fx-place ids', () => {
    for (const fixture of allProspectFixtures) {
      expect(fixture.places.placeId).toBe(`fx-place-${fixture.key}`)
      expect(fixture.places.hasWebsite).toBe(fixture.hasWebsite)
      expect(fixture.places.isFacebookOnly).toBe(fixture.isFacebookOnly)
    }
  })

  it('all phones sit in Ofcom drama ranges', () => {
    for (const fixture of allProspectFixtures) {
      const phones = [fixture.facts.phone?.value, fixture.overture.phone].filter(
        (p): p is string => typeof p === 'string',
      )
      expect(phones.length, fixture.key).toBeGreaterThan(0)
      for (const phone of phones) {
        expect(phone, fixture.key).toMatch(DRAMA_PHONE)
      }
    }
  })

  it('own-website evidence quotes appear verbatim in the scraped markdown', () => {
    for (const fixture of allProspectFixtures) {
      if (!fixture.scrapeMarkdown) continue
      const quotes = [
        ...fixture.facts.services,
        ...fixture.facts.claims,
        ...fixture.facts.accreditations,
        ...(fixture.facts.foundedYear ? [fixture.facts.foundedYear] : []),
      ]
        .filter((f) => f.source === 'own_website' && f.quote)
        .map((f) => f.quote as string)
      expect(quotes.length, fixture.key).toBeGreaterThan(0)
      for (const quote of quotes) {
        expect(fixture.scrapeMarkdown, `${fixture.key}: "${quote}"`).toContain(quote)
      }
    }
  })

  it('segments cover the intended distribution', () => {
    expect(fixturesBySegment('no_site')).toHaveLength(8)
    expect(fixturesBySegment('bad_site')).toHaveLength(8)
    expect(fixturesBySegment('fine')).toHaveLength(4)
  })

  it('entity types cover the intended distribution', () => {
    const counts = { corporate: 0, individual: 0, unknown: 0 }
    for (const fixture of allProspectFixtures) counts[fixture.entityType] += 1
    expect(counts).toEqual({ corporate: 9, individual: 9, unknown: 2 })
  })
})

describe('fixture lookups', () => {
  it('getFixture returns the fixture for a known key', () => {
    expect(getFixture('leeds-plumber-swift').businessName).toBe('Swift Flow Plumbing')
  })

  it('getFixture throws on an unknown key', () => {
    expect(() => getFixture('nope')).toThrow(/Unknown prospect fixture/)
  })

  it('fixturesByTrade filters by trade', () => {
    for (const fixture of fixturesByTrade('plumber')) {
      expect(fixture.trade).toBe('plumber')
    }
  })

  it('fixturesBySegment filters by expected segment', () => {
    for (const fixture of fixturesBySegment('fine')) {
      expect(fixture.expectedSegment).toBe('fine')
    }
  })
})
