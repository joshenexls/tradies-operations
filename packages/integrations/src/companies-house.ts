import { allProspectFixtures } from '@tradies/fixtures'
import type { CostRecorder } from './types'

export type CompanyMatch = {
  entityType: 'corporate' | 'unknown'
  companyNumber?: string
  evidence?: string
}

export interface CompaniesHouseClient {
  matchCompany(input: { name: string; postcode?: string }): Promise<CompanyMatch>
}

/** Case-insensitive match against fixture Companies House records; a miss is 'unknown'. */
export class FixtureCompaniesHouseClient implements CompaniesHouseClient {
  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async matchCompany(input: { name: string; postcode?: string }): Promise<CompanyMatch> {
    this.options.recordCost?.({
      category: 'other',
      provider: 'companies-house-fixture',
      units: 1,
      amountMicroGbp: 0, // Companies House search API is free
      ref: `ch:${input.name}`,
    })
    const wanted = input.name.trim().toLowerCase()
    const fixture = allProspectFixtures.find(
      (f) =>
        f.companiesHouse !== null &&
        (f.companiesHouse.companyName.toLowerCase() === wanted ||
          f.businessName.toLowerCase() === wanted),
    )
    if (!fixture?.companiesHouse) return { entityType: 'unknown' }
    return {
      entityType: 'corporate',
      companyNumber: fixture.companiesHouse.companyNumber,
      evidence: `Companies House ${fixture.companiesHouse.companyNumber}: ${fixture.companiesHouse.companyName} (${fixture.companiesHouse.status})`,
    }
  }
}
