import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ImageRef, SectionKind, SiteSpec } from '@tradies/site-spec'
import {
  FONT_PAIRS,
  PALETTES,
  SECTION_KINDS,
  SECTION_VARIANTS,
  TRADES,
  TRADE_SCHEMA_ORG_TYPE,
  getPalette,
  parseSiteSpec,
  presetConstraints,
  resolveStylePreset,
  stylePresetSchema,
} from '@tradies/site-spec'
import { makeFacts, makeValidSpecInput } from '../../site-spec/src/test-helpers'
import type { TemplateContext } from './index'
import { SEED_STYLE_PRESETS, TEMPLATES, listSectionVariants, renderSite } from './index'

function makeCtx(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    resolveImage: (ref: ImageRef) => ({
      src: `/img/${ref.pool}/${ref.index}.jpg`,
      width: 1600,
      height: 1000,
    }),
    leadFormAction: '/api/leads',
    placeId: null,
    previewBanner: null,
    chatEmbedSrc: null,
    privacyNoticeUrl: '/privacy',
    ...overrides,
  }
}

function render(spec: SiteSpec, ctx: TemplateContext = makeCtx()): string {
  return renderToStaticMarkup(renderSite(spec, ctx))
}

const FAMILY_IDS = Object.keys(TEMPLATES)

type SectionFixture = { kind: SectionKind; variant: string } & Record<string, unknown>

// One fixture per section kind (max spec length is exactly all nine kinds).
const SECTION_FIXTURES: SectionFixture[] = [
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
    intro: 'Straightforward plumbing and heating work, done properly first time.',
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
      },
    ],
  },
  {
    kind: 'about',
    variant: 'story',
    heading: 'A family firm Leeds has trusted for years',
    paragraphs: [
      'Smith & Sons is a family-run plumbing business working across Leeds and the surrounding towns, handling everything from small repairs to full installations.',
      'Every job is done by our own qualified engineers, priced up front and left tidy — no subcontractors, no surprises on the invoice.',
    ],
    image: { pool: 'plumbing-modern', index: 1, alt: 'The Smith & Sons team outside the workshop' },
    highlights: [
      { label: 'Established', value: '2008' },
      { label: 'Gas Safe engineers', value: '4' },
    ],
  },
  {
    kind: 'serviceArea',
    variant: 'chips',
    heading: 'Covering Leeds and nearby',
    blurb: 'Fast response across the whole LS postcode area.',
    areas: ['Leeds', 'Headingley', 'Horsforth', 'Otley', 'Pudsey', 'Morley'],
  },
  {
    kind: 'gallery',
    variant: 'grid',
    heading: 'Recent work around Leeds',
    images: [
      { pool: 'plumbing-modern', index: 2, alt: 'Finished family bathroom in Headingley' },
      { pool: 'plumbing-modern', index: 3, alt: 'New combi boiler installed in a utility room' },
      { pool: 'plumbing-modern', index: 4, alt: 'Copper pipework neatly clipped in a loft' },
    ],
  },
  { kind: 'reviews', variant: 'live-google', heading: 'What Leeds customers say' },
  {
    kind: 'trust',
    variant: 'badges',
    heading: 'Accredited and insured',
    badges: ['gas-safe', 'watersafe', 'city-and-guilds'],
  },
  {
    kind: 'faq',
    variant: 'accordion',
    heading: 'Questions we hear a lot',
    items: [
      {
        question: 'Do you charge for callouts?',
        answer: 'No — we quote before any work starts and only charge for the job itself.',
      },
      {
        question: 'How quickly can you get to an emergency?',
        answer: 'For burst pipes and major leaks in Leeds we aim to be with you within the hour.',
      },
      {
        question: 'Are your engineers Gas Safe registered?',
        answer: 'Yes, every engineer who works on gas appliances is Gas Safe registered.',
      },
    ],
  },
  {
    kind: 'contact',
    variant: 'split-form',
    heading: 'Tell us what needs fixing',
    blurb: 'Send a few details and we will come back the same working day.',
    showPhone: true,
    showLeadForm: true,
    hoursNote: 'Open Monday to Saturday, 7am to 6pm.',
  },
]

function sweepSections(kind: SectionKind, variant: string): SectionFixture[] {
  return SECTION_FIXTURES.map((s) => (s.kind === kind ? { ...s, variant } : s))
}

function specWith(templateId: string, sections: readonly SectionFixture[]): SiteSpec {
  return parseSiteSpec({ ...makeValidSpecInput(), templateId, sections })
}

function baselineSpec(templateId: string): SiteSpec {
  return parseSiteSpec({ ...makeValidSpecInput(), templateId })
}

describe('renderSite baseline per family', () => {
  for (const familyId of FAMILY_IDS) {
    it(`${familyId} renders business name, phone, headline and a single h1`, () => {
      const html = render(baselineSpec(familyId))
      expect(html).toContain('Smith &amp; Sons Plumbing')
      expect(html).toContain('0113 496 0123')
      expect(html).toContain('Trusted plumbers in Leeds')
      expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
    })
  }

  it('throws on an unknown templateId', () => {
    // the contract's baseline id is deliberately not a registered family
    expect(() => renderSite(baselineSpec('trade-classic'), makeCtx())).toThrow(/Unknown templateId/)
  })
})

describe('every section kind and variant renders in every family', () => {
  for (const familyId of FAMILY_IDS) {
    for (const kind of SECTION_KINDS) {
      for (const variant of SECTION_VARIANTS[kind]) {
        it(`${familyId} / ${kind} / ${variant}`, () => {
          const spec = specWith(familyId, sweepSections(kind, variant))
          const html = render(spec, makeCtx({ placeId: 'ChIJtestplace123' }))
          expect(html).not.toContain('undefined')
          expect(html).not.toContain('[object Object]')
          expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
          const imgs = html.match(/<img [^>]*>/g) ?? []
          expect(imgs.length).toBeGreaterThan(0)
          for (const tag of imgs) {
            expect(tag).toMatch(/alt="[^"]+"/)
          }
        })
      }
    }
  }
})

describe('preview banner', () => {
  it('appears with operator name and compliance wording when set', () => {
    const html = render(
      baselineSpec('classic'),
      makeCtx({
        previewBanner: { operatorName: 'Enex Studio', claimUrl: 'https://claim.example/x' },
      }),
    )
    expect(html).toContain('not the official website')
    expect(html).toContain('Enex Studio')
    expect(html).toContain('https://claim.example/x')
    expect(html).toContain('Website by Enex Studio')
  })

  it('is absent otherwise', () => {
    const html = render(baselineSpec('modern'))
    expect(html).not.toContain('not the official website')
  })
})

describe('reviews section (retired)', () => {
  const sections = sweepSections('reviews', 'live-google')

  it('renders no widget and no empty band, with or without a placeId', () => {
    for (const placeId of [null, 'ChIJabc123']) {
      const html = render(specWith('bold', sections), makeCtx({ placeId }))
      expect(html).not.toContain('data-reviews-widget')
      expect(html).not.toContain('data-place-id')
      expect(html).not.toContain('id="reviews"')
    }
  })
})

describe('contact map + reviews CTA', () => {
  const MAP_SRC = 'https://maps.google.com/maps?q=Test%2C+Leeds&output=embed'
  const REVIEWS_URL = 'https://search.google.com/local/reviews?placeid=ChIJx'
  // any rating / star / review-claim wording is a compliance failure
  const REVIEW_CLAIM = /\d\s*(?:\/|out of)\s*5|\bstars?\b|\brated\b|\baggregateRating\b/i

  function extractJsonLd(html: string): Record<string, unknown> {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    return JSON.parse(match?.[1] ?? '') as Record<string, unknown>
  }

  it('renders the keyless map and the compliant reviews link when both are set', () => {
    for (const familyId of FAMILY_IDS) {
      const html = render(
        baselineSpec(familyId),
        makeCtx({ location: { mapsEmbedSrc: MAP_SRC, reviewsUrl: REVIEWS_URL } }),
      )
      // keyless, plain (non-sandboxed) iframe with the exact embed src
      expect(html).toContain('<iframe')
      expect(html).toContain('maps.google.com/maps?q=Test%2C+Leeds')
      expect(html).toContain('output=embed')
      expect(html).toContain('loading="lazy"')
      expect(html).not.toContain('sandbox')
      expect(html).not.toContain('allow=')
      // fixed-label link to the business's own real Google listing
      expect(html).toContain(`href="${REVIEWS_URL}"`)
      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toContain('See our reviews on Google')
    }
  })

  it('renders the map but no reviews link when reviewsUrl is null', () => {
    const html = render(
      baselineSpec('modern'),
      makeCtx({ location: { mapsEmbedSrc: MAP_SRC, reviewsUrl: null } }),
    )
    expect(html).toContain('<iframe')
    expect(html).toContain('output=embed')
    expect(html).not.toContain('See our reviews on Google')
    expect(html).not.toContain('search.google.com/local/reviews')
  })

  it('renders neither when location is absent, keeping the contact section intact', () => {
    const html = render(baselineSpec('classic'), makeCtx({ location: null }))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('See our reviews on Google')
    // contact still renders its normal content
    expect(html).toContain('Tell us what needs fixing')
    expect(html).toContain('action="/api/leads"')
  })

  it('emits no rating or review-claim text and no aggregateRating in JSON-LD', () => {
    for (const familyId of FAMILY_IDS) {
      const html = render(
        baselineSpec(familyId),
        makeCtx({ location: { mapsEmbedSrc: MAP_SRC, reviewsUrl: REVIEWS_URL } }),
      )
      expect(html).not.toMatch(REVIEW_CLAIM)
      expect(extractJsonLd(html).aggregateRating).toBeUndefined()
    }
  })
})

describe('lead form', () => {
  it('posts to ctx.leadFormAction with a hidden intent field when showLeadForm', () => {
    for (const familyId of FAMILY_IDS) {
      const html = render(specWith(familyId, SECTION_FIXTURES))
      expect(html).toContain('action="/api/leads"')
      expect(html).toContain('method="post"')
      expect(html).toContain('name="intent"')
      expect(html).toContain('<label')
    }
  })

  it('is absent when showLeadForm is false', () => {
    const sections = SECTION_FIXTURES.map((s) =>
      s.kind === 'contact' ? { ...s, showLeadForm: false } : s,
    )
    const html = render(specWith('classic', sections))
    expect(html).not.toContain('<form')
  })
})

describe('JSON-LD', () => {
  function extractJsonLd(html: string): Record<string, unknown> {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(match?.[1]).toBeTruthy()
    return JSON.parse(match?.[1] ?? '') as Record<string, unknown>
  }

  it('parses as JSON and follows the trade schema.org type', () => {
    for (const trade of TRADES) {
      const facts = makeFacts({ trade })
      const spec = parseSiteSpec({ ...makeValidSpecInput(facts), templateId: 'classic' })
      const data = extractJsonLd(render(spec))
      expect(data['@type']).toBe(TRADE_SCHEMA_ORG_TYPE[trade])
      expect(data.name).toBe(facts.businessName)
    }
  })

  it('never contains aggregateRating', () => {
    for (const familyId of FAMILY_IDS) {
      const html = render(specWith(familyId, SECTION_FIXTURES))
      expect(html).not.toContain('aggregateRating')
    }
  })
})

describe('theming', () => {
  it('sets palette CSS variables on the root wrapper', () => {
    const html = render(baselineSpec('classic'))
    const palette = getPalette('navy-brass')
    expect(html).toContain('--tp-primary')
    expect(html).toContain(palette.primary)
    expect(html).toContain(palette.accent)
    expect(html).toContain('--tp-radius')
  })

  it('injects the chat embed script only when provided', () => {
    const withChat = render(baselineSpec('bold'), makeCtx({ chatEmbedSrc: '/embed/chat.js' }))
    expect(withChat).toContain('src="/embed/chat.js"')
    expect(render(baselineSpec('bold'))).not.toContain('/embed/chat.js')
  })
})

describe('seed style presets', () => {
  it('all parse and reference registered templates, palettes and font pairs', () => {
    expect(SEED_STYLE_PRESETS).toHaveLength(6)
    for (const preset of SEED_STYLE_PRESETS) {
      expect(stylePresetSchema.safeParse(preset).success).toBe(true)
      expect(TEMPLATES[preset.templateId]).toBeDefined()
      expect(PALETTES.some((p) => p.id === preset.paletteId)).toBe(true)
      expect(FONT_PAIRS.some((f) => f.id === preset.fontPairId)).toBe(true)
    }
  })

  it('resolves modern + plumber to the deep-teal specialisation', () => {
    const resolved = resolveStylePreset(SEED_STYLE_PRESETS, 'modern', 'plumber')
    expect(resolved?.trade).toBe('plumber')
    expect(resolved?.paletteId).toBe('deep-teal')
    expect(resolved?.imageryPool).toBe('plumbing-modern')
  })

  it('falls back to the generic preset for unspecialised trades', () => {
    const resolved = resolveStylePreset(SEED_STYLE_PRESETS, 'modern', 'builder')
    expect(resolved?.trade).toBeNull()
    expect(resolved?.paletteId).toBe('graphite-amber')
  })

  it('yields non-empty allowedVariants for every section kind', () => {
    for (const preset of SEED_STYLE_PRESETS) {
      const constraints = presetConstraints(preset)
      for (const kind of SECTION_KINDS) {
        expect(constraints.allowedVariants[kind].length).toBeGreaterThan(0)
      }
    }
  })

  it('listSectionVariants re-exports the contract registry', () => {
    expect(listSectionVariants()).toBe(SECTION_VARIANTS)
  })
})
