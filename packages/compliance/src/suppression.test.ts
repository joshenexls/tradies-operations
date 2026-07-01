import { describe, expect, it } from 'vitest'
import type { SuppressionEntry } from './gates'
import { assertNotSuppressed, checkSuppression } from './gates'
import { expectComplianceError } from './test-helpers'

describe('checkSuppression', () => {
  it('blocks an email that matches an email entry, case-insensitively', () => {
    const entries: SuppressionEntry[] = [{ kind: 'email', value: 'Info@Acme.co.uk' }]
    const result = checkSuppression(entries, { email: ' info@ACME.co.uk ' })
    expect(result.suppressed).toBe(true)
    expect(result.matches).toEqual(entries)
  })

  it('blocks any email at a suppressed domain', () => {
    const entries: SuppressionEntry[] = [{ kind: 'domain', value: 'acme.co.uk' }]
    expect(checkSuppression(entries, { email: 'accounts@ACME.co.uk' }).suppressed).toBe(true)
    expect(checkSuppression(entries, { email: 'info@other.co.uk' }).suppressed).toBe(false)
  })

  it('matches phone entries across UK formats in both directions', () => {
    const international: SuppressionEntry[] = [{ kind: 'phone', value: '+44 7700 900123' }]
    expect(checkSuppression(international, { phone: '07700900123' }).suppressed).toBe(true)

    const national: SuppressionEntry[] = [{ kind: 'phone', value: '07700900123' }]
    expect(checkSuppression(national, { phone: '+44 7700 900123' }).suppressed).toBe(true)
  })

  it('matches place_id entries', () => {
    const entries: SuppressionEntry[] = [{ kind: 'place_id', value: 'ChIJdd4hrwug2EcRmSrV3Vo6llI' }]
    const result = checkSuppression(entries, { placeId: ' ChIJdd4hrwug2EcRmSrV3Vo6llI ' })
    expect(result.suppressed).toBe(true)
  })

  it('does not suppress an empty identity', () => {
    const entries: SuppressionEntry[] = [
      { kind: 'email', value: 'info@acme.co.uk' },
      { kind: 'domain', value: 'acme.co.uk' },
      { kind: 'phone', value: '07700900123' },
      { kind: 'place_id', value: 'ChIJdd4hrwug2EcRmSrV3Vo6llI' },
    ]
    expect(checkSuppression(entries, {})).toEqual({ suppressed: false, matches: [] })
  })

  it('one match of any kind suppresses every channel (opt-out is global)', () => {
    // a phone opt-out must block an email or postcard to the same business
    const entries: SuppressionEntry[] = [{ kind: 'phone', value: '07700 900123' }]
    const result = checkSuppression(entries, {
      email: 'info@acme.co.uk',
      phone: '+44 7700 900123',
      placeId: 'ChIJdd4hrwug2EcRmSrV3Vo6llI',
    })
    expect(result.suppressed).toBe(true)
    expect(result.matches).toHaveLength(1)
  })

  it('returns every matching entry', () => {
    const entries: SuppressionEntry[] = [
      { kind: 'email', value: 'info@acme.co.uk' },
      { kind: 'domain', value: 'acme.co.uk' },
      { kind: 'phone', value: '01134960000' },
    ]
    const result = checkSuppression(entries, { email: 'info@acme.co.uk', phone: '07700900123' })
    expect(result.matches).toHaveLength(2)
  })

  it('passes an identity with no matching entries', () => {
    const entries: SuppressionEntry[] = [{ kind: 'email', value: 'info@acme.co.uk' }]
    const result = checkSuppression(entries, { email: 'hello@fresh.co.uk', phone: '07700900123' })
    expect(result).toEqual({ suppressed: false, matches: [] })
  })
})

describe('assertNotSuppressed', () => {
  it('throws suppressed when any entry matches', () => {
    expectComplianceError(
      () =>
        assertNotSuppressed([{ kind: 'domain', value: 'acme.co.uk' }], { email: 'a@acme.co.uk' }),
      'suppressed',
    )
  })

  it('passes a clean identity', () => {
    expect(() =>
      assertNotSuppressed([{ kind: 'email', value: 'info@acme.co.uk' }], { email: 'b@other.com' }),
    ).not.toThrow()
  })
})
