import { parseSiteSpec } from '@tradies/site-spec'
import type { BusinessFacts, SiteSpec } from '@tradies/site-spec'

/**
 * A minimal contract-valid SiteSpec for schema tests. Built through
 * parseSiteSpec so the fixture can never drift from @tradies/site-spec.
 */
export function specFixture(): SiteSpec {
  const facts: BusinessFacts = {
    businessName: 'Smith & Sons Plumbing',
    trade: 'plumber',
    town: 'Leeds',
    serviceAreas: ['Leeds', 'Headingley'],
    services: [
      { value: 'Boiler repair', source: 'own_website', quote: 'We repair all boiler makes' },
    ],
    accreditations: [],
    claims: [],
  }
  return parseSiteSpec({
    specVersion: 1,
    templateId: 'trade-classic',
    identity: { businessName: facts.businessName, trade: facts.trade, town: facts.town },
    theme: { paletteId: 'navy-brass', fontPairId: 'archivo-inter', radius: 'soft' },
    sections: [
      {
        kind: 'hero',
        variant: 'classic',
        headline: 'Trusted plumbers in Leeds',
        subheadline: 'From dripping taps to full boiler swaps, we keep Leeds homes running.',
        ctaLabel: 'Get a free quote',
        image: { pool: 'plumbing-modern', index: 0, alt: 'Plumber fitting a modern boiler' },
      },
      {
        kind: 'services',
        variant: 'grid',
        heading: 'What we do for your home',
        items: [
          {
            title: 'Boiler repair',
            description: 'Fast diagnosis and repair for all major boiler makes and models.',
          },
          {
            title: 'Leak fixes',
            description: 'From dripping taps to hidden pipework leaks, traced and fixed fast.',
          },
          {
            title: 'Radiator care',
            description: 'Balancing, bleeding and replacement to keep every room warm.',
          },
        ],
      },
      {
        kind: 'serviceArea',
        variant: 'chips',
        heading: 'Covering Leeds and nearby',
        areas: ['Leeds', 'Headingley'],
      },
      {
        kind: 'contact',
        variant: 'split-form',
        heading: 'Tell us what needs fixing',
        blurb: 'Send a few details and we will come back the same working day.',
        showPhone: true,
        showLeadForm: true,
      },
    ],
    seo: {
      title: 'Smith & Sons Plumbing — Plumbers in Leeds',
      description: 'Local Leeds plumbers for boiler repair, leak fixes and radiator care.',
    },
    facts,
  })
}
