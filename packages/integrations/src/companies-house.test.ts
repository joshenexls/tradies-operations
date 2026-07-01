import { describe, expect, it } from 'vitest'
import { FixtureCompaniesHouseClient } from './companies-house'
import type { CostEntry } from './types'

describe('FixtureCompaniesHouseClient', () => {
  const client = new FixtureCompaniesHouseClient()

  it('matches a registered company name case-insensitively', async () => {
    const match = await client.matchCompany({ name: 'swift flow plumbing ltd' })
    expect(match.entityType).toBe('corporate')
    expect(match.companyNumber).toBe('08214563')
    expect(match.evidence).toContain('SWIFT FLOW PLUMBING LTD')
  })

  it('also matches the trading name', async () => {
    const match = await client.matchCompany({ name: 'Trent Electrical Contractors' })
    expect(match.entityType).toBe('corporate')
    expect(match.companyNumber).toBe('05432198')
  })

  it('returns unknown on a miss', async () => {
    const match = await client.matchCompany({ name: 'No Such Trading Co', postcode: 'LS1 1AA' })
    expect(match).toEqual({ entityType: 'unknown' })
  })

  it('returns unknown for sole traders without a Companies House record', async () => {
    const match = await client.matchCompany({ name: 'Peak District Roofing' })
    expect(match.entityType).toBe('unknown')
    expect(match.companyNumber).toBeUndefined()
  })

  it('records a zero-cost entry (the search API is free)', async () => {
    const entries: CostEntry[] = []
    const recording = new FixtureCompaniesHouseClient({ recordCost: (e) => entries.push(e) })
    await recording.matchCompany({ name: 'Avon Electrical' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.category).toBe('other')
    expect(entries[0]?.amountMicroGbp).toBe(0)
  })
})
