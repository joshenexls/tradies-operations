import type { BusinessFacts, Trade } from '@tradies/site-spec'

export type EntityType = 'corporate' | 'individual' | 'unknown'

export type ProspectSegment = 'no_site' | 'bad_site' | 'fine'

/**
 * One hand-written UK prospect used across the offline engine: what discovery
 * would find (places/overture), what enrichment would add (companiesHouse,
 * psi, scrapeMarkdown) and the evidenced facts sheet generation runs from.
 */
export type ProspectFixture = {
  key: string
  businessName: string
  trade: Trade
  town: string
  entityType: EntityType
  hasWebsite: boolean
  isFacebookOnly: boolean
  websiteUrl?: string
  expectedSegment: ProspectSegment
  facts: BusinessFacts
  scrapeMarkdown?: string
  places: { placeId: string; hasWebsite: boolean; isFacebookOnly: boolean }
  companiesHouse: { companyNumber: string; companyName: string; status: 'active' } | null
  overture: {
    overtureId: string
    name: string
    phone?: string
    website?: string
    address?: string
    postcode?: string
  }
  psi: { performance: number; https: boolean } | null
}
