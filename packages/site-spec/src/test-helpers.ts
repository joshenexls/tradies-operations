import type { BusinessFacts } from './facts'
import type { SiteSpec, SiteSpecInput } from './site-spec'
import { parseSiteSpec } from './site-spec'

/** A fully-evidenced facts sheet for tests. */
export function makeFacts(overrides: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: 'Smith & Sons Plumbing',
    trade: 'plumber',
    town: 'Leeds',
    phone: { value: '0113 496 0123', source: 'overture' },
    email: { value: 'info@smithplumbing.example', source: 'own_website' },
    serviceAreas: ['Leeds', 'Headingley', 'Horsforth', 'Otley'],
    services: [
      { value: 'Boiler repair', source: 'own_website', quote: 'We repair all boiler makes' },
      { value: 'Bathroom installation', source: 'own_website' },
      { value: 'Emergency callouts', source: 'own_website' },
    ],
    accreditations: [{ id: 'gas-safe', source: 'own_website', quote: 'Gas Safe reg 512345' }],
    foundedYear: { value: 2008, source: 'own_website', quote: 'serving Leeds since 2008' },
    claims: [{ value: 'Fully insured up to £2m', source: 'own_website' }],
    companiesHouseNumber: undefined,
    ...overrides,
  }
}

export function makeValidSpecInput(facts = makeFacts()): SiteSpecInput {
  return {
    specVersion: 1,
    templateId: 'trade-classic',
    identity: {
      businessName: facts.businessName,
      trade: facts.trade,
      town: facts.town,
      phone: facts.phone?.value,
      email: facts.email?.value,
      strapline: 'Reliable plumbing across Leeds',
    },
    theme: { paletteId: 'navy-brass', fontPairId: 'archivo-inter', radius: 'soft' },
    sections: [
      {
        kind: 'hero',
        variant: 'classic',
        headline: 'Trusted plumbers in Leeds',
        subheadline:
          'From dripping taps to full bathroom installations, Smith & Sons keep Leeds homes running.',
        ctaLabel: 'Get a free quote',
        image: { pool: 'plumbing-modern', index: 0, alt: 'Plumber fitting a modern boiler' },
        badges: ['gas-safe'],
      },
      {
        kind: 'services',
        variant: 'grid',
        heading: 'What we do for your home',
        items: [
          {
            title: 'Boiler repair',
            description: 'Fast diagnosis and repair for all major boiler makes and models.',
            icon: 'flame',
          },
          {
            title: 'Bathroom installation',
            description: 'Complete bathroom fitting, from first design chat to final tile.',
            icon: 'droplet',
          },
          {
            title: 'Emergency callouts',
            description: 'Burst pipe or sudden leak? We answer around the clock in Leeds.',
            icon: 'clock',
          },
        ],
      },
      {
        kind: 'serviceArea',
        variant: 'chips',
        heading: 'Covering Leeds and nearby',
        areas: ['Leeds', 'Headingley', 'Horsforth'],
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
      description:
        'Local Leeds plumbers for boiler repair, bathroom installation and emergency callouts.',
    },
    facts,
  }
}

export function makeValidSpec(facts = makeFacts()): SiteSpec {
  return parseSiteSpec(makeValidSpecInput(facts))
}
