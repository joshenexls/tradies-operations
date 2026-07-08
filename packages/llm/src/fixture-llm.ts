import type { SiteSpecInput, Trade } from '@tradies/site-spec'
import { TRADE_LABELS, presetConstraints } from '@tradies/site-spec'
import {
  ABOUT_CLOSERS,
  ABOUT_OPENERS,
  CONTACT_HEADINGS,
  CTA_LABELS,
  HEADLINES,
  SERVICE_DESCRIPTIONS,
  STRAPLINES,
  SUBHEADLINE_TAILS,
  TRADE_NOUNS,
  hashSeed,
  mulberry32,
  pick,
  serviceTitles,
  type Slots,
} from './fixture-copy'
import type { GenerationInput, GenerationResult, SiteSpecGenerator } from './generator'

/**
 * Deterministic stand-in for the real generator: same input → byte-identical
 * candidate (seeded PRNG over businessName + styleKey; no Math.random, no
 * Date). Copy only ever states what the facts sheet evidences, so every
 * candidate passes FACT-GUARD and the preset validator by construction.
 * The shared PRNG + tone phrase tables live in fixture-copy.ts.
 */

type ServiceIcon =
  | 'wrench'
  | 'droplet'
  | 'flame'
  | 'bolt'
  | 'plug'
  | 'lightbulb'
  | 'house'
  | 'hammer'
  | 'shield'
  | 'clock'
  | 'thermometer'
  | 'sun'

const TRADE_ICONS: Record<Trade, readonly ServiceIcon[]> = {
  plumber: ['droplet', 'wrench', 'clock'],
  electrician: ['bolt', 'plug', 'lightbulb'],
  roofer: ['house', 'hammer', 'shield'],
  builder: ['hammer', 'house', 'wrench'],
  heating: ['flame', 'thermometer', 'clock'],
  other: ['wrench', 'house', 'clock'],
}

export function buildFixtureCandidate(input: GenerationInput): SiteSpecInput {
  const { facts, preset, feedback = '' } = input
  const constraints = presetConstraints(preset)
  const tone = constraints.tone
  const rng = mulberry32(hashSeed(`${facts.businessName}|${preset.styleKey}`))
  const slots: Slots = {
    name: facts.businessName,
    town: facts.town,
    label: TRADE_LABELS[facts.trade],
    noun: TRADE_NOUNS[facts.trade],
  }

  // Fixed draw order keeps output stable regardless of which sections render.
  const heroVariant = pick(rng, constraints.allowedVariants.hero) as 'classic' | 'split' | 'overlay'
  const servicesVariant = pick(rng, constraints.allowedVariants.services) as
    'grid' | 'cards' | 'list'
  const aboutVariant = pick(rng, constraints.allowedVariants.about) as 'portrait' | 'story'
  const areaVariant = pick(rng, constraints.allowedVariants.serviceArea) as 'chips' | 'columns'
  const trustVariant = pick(rng, constraints.allowedVariants.trust) as 'badges' | 'banner'
  const faqVariant = pick(rng, constraints.allowedVariants.faq) as 'accordion' | 'two-column'
  const contactVariant = pick(rng, constraints.allowedVariants.contact) as 'split-form' | 'banner'
  let heroImageIndex = Math.floor(rng() * 6)
  const aboutImageIndex = Math.floor(rng() * 6)
  const headlineTemplate = pick(rng, HEADLINES[tone])

  const wantsShorterHeadline = /shorter\s+headline/i.test(feedback)
  if (/different\s+image|change\s+the\s+image/i.test(feedback)) {
    heroImageIndex = (heroImageIndex + 1) % 6
  }

  const shortHeadline = `${slots.noun.charAt(0).toUpperCase()}${slots.noun.slice(1)} in ${facts.town}`
  let headline = wantsShorterHeadline ? shortHeadline : headlineTemplate(slots)
  if (headline.length > 80) headline = shortHeadline

  const titles = serviceTitles(facts)
  const subheadline = `From ${(titles[0] ?? 'repairs').toLowerCase()} to ${(titles[1] ?? 'maintenance').toLowerCase()}, ${SUBHEADLINE_TAILS[tone](facts.town)}`

  const descriptions = SERVICE_DESCRIPTIONS[tone]
  const icons = TRADE_ICONS[facts.trade]
  const serviceItems = titles.map((title, i) => {
    const describe = descriptions[i % descriptions.length]
    const icon = icons[i % icons.length]
    return {
      title,
      description: describe ? describe(title) : `${title} handled with care from start to finish.`,
      ...(icon ? { icon } : {}),
    }
  })

  const badgeIds = facts.accreditations.map((a) => a.id)

  const aboutSentences = [ABOUT_OPENERS[tone](slots)]
  if (facts.foundedYear) {
    aboutSentences.push(
      `Established ${facts.foundedYear.value}, and still proud of every job that carries the name.`,
    )
  }
  if (facts.claims.length > 0) {
    aboutSentences.push(`${facts.claims.map((c) => c.value).join('. ')}.`)
  }

  const areas = [...new Set([facts.town, ...facts.serviceAreas])].slice(0, 24)

  const sections: SiteSpecInput['sections'] = [
    {
      kind: 'hero',
      variant: heroVariant,
      headline,
      subheadline,
      ctaLabel: CTA_LABELS[tone],
      image: {
        pool: constraints.imageryPool,
        index: heroImageIndex,
        alt: `${slots.label} work in ${facts.town}`,
      },
      badges: badgeIds.slice(0, 4),
    },
    {
      kind: 'services',
      variant: servicesVariant,
      heading: 'What we do',
      intro: `The jobs we're asked about most in ${facts.town}.`,
      items: serviceItems,
    },
    {
      kind: 'about',
      variant: aboutVariant,
      heading: `About ${facts.businessName}`,
      paragraphs: [aboutSentences.join(' '), ABOUT_CLOSERS[tone]],
      image: {
        pool: constraints.imageryPool,
        index: aboutImageIndex,
        alt: `${slots.label} tools of the trade`,
      },
      highlights: facts.foundedYear
        ? [{ label: 'Established', value: `${facts.foundedYear.value}` }]
        : [],
    },
    {
      kind: 'serviceArea',
      variant: areaVariant,
      heading: 'Areas we cover',
      blurb: `Based in ${facts.town} and covering the areas below.`,
      areas,
    },
  ]

  if (badgeIds.length > 0) {
    sections.push({
      kind: 'trust',
      variant: trustVariant,
      heading: 'Our accreditations',
      badges: badgeIds.slice(0, 6),
    })
  }

  sections.push(
    {
      kind: 'faq',
      variant: faqVariant,
      heading: 'Frequently asked questions',
      items: [
        {
          question: 'Which areas do you cover?',
          answer: `We're based in ${facts.town} and cover the areas listed on this page. If you're just outside them, ask — we can often help.`,
        },
        {
          question: 'How do I get a quote?',
          answer:
            "Send a few details through the contact form or give us a call. We'll take a look and come back with a clear price.",
        },
        {
          question: 'When can you fit the work in?',
          answer:
            "We'll be upfront about lead times when you get in touch, and we'll agree a date that suits you before anything starts.",
        },
      ],
    },
    {
      kind: 'contact',
      variant: contactVariant,
      heading: CONTACT_HEADINGS[tone],
      blurb: "Call, or send a few details through the form, and we'll get back to you promptly.",
      showPhone: facts.phone !== undefined,
      showLeadForm: true,
    },
  )

  let seoTitle = `${facts.businessName} — ${slots.label} in ${facts.town}`
  if (seoTitle.length > 70) seoTitle = `${facts.businessName} — ${facts.town}`.slice(0, 70).trim()

  return {
    specVersion: 1,
    templateId: constraints.templateId,
    identity: {
      businessName: facts.businessName,
      trade: facts.trade,
      town: facts.town,
      phone: facts.phone?.value,
      email: facts.email?.value,
      strapline: STRAPLINES[tone](slots),
    },
    theme: {
      paletteId: constraints.paletteId,
      fontPairId: constraints.fontPairId,
      radius: constraints.radius,
    },
    sections,
    seo: {
      title: seoTitle,
      description: `Local ${slots.label.toLowerCase()} services in ${facts.town} from ${facts.businessName}. Send a few details and get a clear, honest quote.`,
    },
    facts,
  }
}

export class FixtureLLM implements SiteSpecGenerator {
  async generateSiteSpec(input: GenerationInput): Promise<GenerationResult> {
    const candidate = buildFixtureCandidate(input)
    return {
      candidate,
      model: 'fixture-llm-v1',
      usage: {
        inputTokens: Math.ceil(JSON.stringify(input.facts).length / 4),
        outputTokens: Math.ceil(JSON.stringify(candidate).length / 4),
      },
    }
  }
}
