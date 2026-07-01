import type { Trade } from '@tradies/site-spec'
import { allProspectFixtures } from './prospects'
import type { ProspectFixture, ProspectSegment } from './types'

export * from './types'
export { allProspectFixtures }

export function getFixture(key: string): ProspectFixture {
  const fixture = allProspectFixtures.find((f) => f.key === key)
  if (!fixture) throw new Error(`Unknown prospect fixture: ${key}`)
  return fixture
}

export function fixturesByTrade(trade: Trade): ProspectFixture[] {
  return allProspectFixtures.filter((f) => f.trade === trade)
}

export function fixturesBySegment(segment: ProspectSegment): ProspectFixture[] {
  return allProspectFixtures.filter((f) => f.expectedSegment === segment)
}
