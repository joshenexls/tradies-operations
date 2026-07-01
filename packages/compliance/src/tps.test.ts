import { describe, expect, it } from 'vitest'
import { assertCallAllowed, tpsScreeningValid } from './gates'
import { NOW, daysAgo, expectComplianceError } from './test-helpers'

describe('tpsScreeningValid', () => {
  it('is valid at 27 days', () => {
    expect(tpsScreeningValid(daysAgo(27), { now: NOW })).toBe(true)
  })

  it('is still valid at the 28-day boundary exactly', () => {
    expect(tpsScreeningValid(daysAgo(28), { now: NOW })).toBe(true)
  })

  it('is stale at 29 days', () => {
    expect(tpsScreeningValid(daysAgo(29), { now: NOW })).toBe(false)
  })

  it('is not valid when never screened', () => {
    expect(tpsScreeningValid(null, { now: NOW })).toBe(false)
  })

  it('respects a custom validityDays', () => {
    expect(tpsScreeningValid(daysAgo(10), { now: NOW, validityDays: 7 })).toBe(false)
    expect(tpsScreeningValid(daysAgo(7), { now: NOW, validityDays: 7 })).toBe(true)
  })
})

describe('assertCallAllowed', () => {
  it('passes a fresh screening', () => {
    expect(() => assertCallAllowed({ tpsScreenedAt: daysAgo(27) }, { now: NOW })).not.toThrow()
  })

  it('throws tps_not_screened when the number was never screened', () => {
    expectComplianceError(
      () => assertCallAllowed({ tpsScreenedAt: null }, { now: NOW }),
      'tps_not_screened',
    )
  })

  it('throws tps_screening_stale at 29 days', () => {
    expectComplianceError(
      () => assertCallAllowed({ tpsScreenedAt: daysAgo(29) }, { now: NOW }),
      'tps_screening_stale',
    )
  })
})
