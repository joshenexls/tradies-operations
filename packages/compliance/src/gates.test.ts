import { describe, expect, it } from 'vitest'
import {
  assertColdEmailAllowed,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePlaceId,
} from './gates'
import { NOW, daysAgo, expectComplianceError } from './test-helpers'

describe('assertColdEmailAllowed', () => {
  it('passes a corporate subscriber with a fresh entity check', () => {
    expect(() =>
      assertColdEmailAllowed(
        { entityType: 'corporate', entityCheckedAt: daysAgo(10) },
        { now: NOW },
      ),
    ).not.toThrow()
  })

  it('passes at the 90-day boundary exactly', () => {
    expect(() =>
      assertColdEmailAllowed(
        { entityType: 'corporate', entityCheckedAt: daysAgo(90) },
        { now: NOW },
      ),
    ).not.toThrow()
  })

  it('throws not_corporate for an individual subscriber even with a fresh check', () => {
    expectComplianceError(
      () =>
        assertColdEmailAllowed(
          { entityType: 'individual', entityCheckedAt: daysAgo(1) },
          { now: NOW },
        ),
      'not_corporate',
    )
  })

  it('treats unknown as individual but reports entity_unknown', () => {
    expectComplianceError(
      () =>
        assertColdEmailAllowed(
          { entityType: 'unknown', entityCheckedAt: daysAgo(1) },
          { now: NOW },
        ),
      'entity_unknown',
    )
  })

  it('throws entity_check_stale for a 91-day-old check', () => {
    expectComplianceError(
      () =>
        assertColdEmailAllowed(
          { entityType: 'corporate', entityCheckedAt: daysAgo(91) },
          { now: NOW },
        ),
      'entity_check_stale',
    )
  })

  it('throws entity_check_stale when the entity was never checked', () => {
    expectComplianceError(
      () =>
        assertColdEmailAllowed({ entityType: 'corporate', entityCheckedAt: null }, { now: NOW }),
      'entity_check_stale',
    )
  })

  it('respects a custom maxEntityAgeDays', () => {
    expectComplianceError(
      () =>
        assertColdEmailAllowed(
          { entityType: 'corporate', entityCheckedAt: daysAgo(31) },
          { now: NOW, maxEntityAgeDays: 30 },
        ),
      'entity_check_stale',
    )
    expect(() =>
      assertColdEmailAllowed(
        { entityType: 'corporate', entityCheckedAt: daysAgo(30) },
        { now: NOW, maxEntityAgeDays: 30 },
      ),
    ).not.toThrow()
  })
})

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Info@ACME.co.uk ')).toBe('info@acme.co.uk')
  })
})

describe('normalizeDomain', () => {
  it('extracts the domain from an email address', () => {
    expect(normalizeDomain('Info@ACME.co.uk')).toBe('acme.co.uk')
  })

  it('passes a bare domain through', () => {
    expect(normalizeDomain(' Acme.co.uk ')).toBe('acme.co.uk')
  })
})

describe('normalizePhone', () => {
  it('converts +44 to the 0 trunk prefix', () => {
    expect(normalizePhone('+44 7700 900123')).toBe('07700900123')
  })

  it('strips spaces and punctuation', () => {
    expect(normalizePhone('(0113) 496-0000')).toBe('01134960000')
    expect(normalizePhone('07700 900.123')).toBe('07700900123')
  })

  it('handles 0044 and the parenthesised trunk zero', () => {
    expect(normalizePhone('0044 7700 900123')).toBe('07700900123')
    expect(normalizePhone('+44 (0)7700 900123')).toBe('07700900123')
  })
})

describe('normalizePlaceId', () => {
  it('trims whitespace without touching case', () => {
    expect(normalizePlaceId(' ChIJdd4hrwug2EcRmSrV3Vo6llI ')).toBe('ChIJdd4hrwug2EcRmSrV3Vo6llI')
  })
})
