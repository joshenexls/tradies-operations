import type { BusinessFacts, SiteSpecInput, StylePreset, Trade } from '@tradies/site-spec'
import { TRADE_LABELS, presetConstraints } from '@tradies/site-spec'
import type { GenerationInput, GenerationResult, SiteSpecGenerator } from './generator'

/**
 * Deterministic stand-in for the real generator: same input → byte-identical
 * candidate (seeded PRNG over businessName + styleKey; no Math.random, no
 * Date). Copy only ever states what the facts sheet evidences, so every
 * candidate passes FACT-GUARD and the preset validator by construction.
 */

type Tone = StylePreset['tone']

type Slots = { name: string; town: string; label: string; noun: string }

function hashSeed(input: string): number {
  // FNV-1a, folded to uint32 — stable across runs and platforms
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, options: readonly T[]): T {
  const choice = options[Math.floor(rng() * options.length)]
  if (choice === undefined) throw new Error('cannot pick from an empty list')
  return choice
}

const TRADE_NOUNS: Record<Trade, string> = {
  plumber: 'plumbers',
  electrician: 'electricians',
  roofer: 'roofers',
  builder: 'builders',
  heating: 'heating engineers',
  other: 'property specialists',
}

/** Non-factual filler titles used only to reach the 3-item section minimum. */
const GENERIC_SERVICES: Record<Trade, readonly string[]> = {
  plumber: ['General plumbing', 'Leak repairs', 'Tap and toilet repairs'],
  electrician: ['Lighting installation', 'Fault finding', 'Extra sockets and switches'],
  roofer: ['Roof repairs', 'Gutter clearing', 'Roof inspections'],
  builder: ['General building work', 'Home repairs', 'Property maintenance'],
  heating: ['Boiler servicing', 'Radiator repairs', 'Heating system checks'],
  other: ['General repairs', 'Odd jobs and fixes', 'Property maintenance'],
}

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

const HEADLINES: Record<Tone, readonly ((s: Slots) => string)[]> = {
  friendly: [
    (s) => `${s.name} — friendly ${s.noun} in ${s.town}`,
    (s) => `${s.name}, your local ${s.noun} in ${s.town}`,
  ],
  professional: [
    (s) => `${s.name} — professional ${s.noun} in ${s.town}`,
    (s) => `Professional ${s.label.toLowerCase()} in ${s.town} from ${s.name}`,
  ],
  premium: [
    (s) => `${s.name} — refined ${s.label.toLowerCase()} for ${s.town} homes`,
    (s) => `${s.label} for ${s.town} homes, by ${s.name}`,
  ],
  'no-nonsense': [
    (s) => `${s.name} — ${s.noun} in ${s.town}. No fuss.`,
    (s) => `${s.name}: straightforward ${s.label.toLowerCase()} in ${s.town}`,
  ],
}

const SUBHEADLINE_TAILS: Record<Tone, (town: string) => string> = {
  friendly: (town) => `we're here to help homes across ${town}.`,
  professional: (town) => `we deliver dependable work for homes across ${town}.`,
  premium: (town) => `every detail is handled with care for homes across ${town}.`,
  'no-nonsense': (town) => `we turn up, sort it and clear up, right across ${town}.`,
}

const SERVICE_DESCRIPTIONS: Record<Tone, readonly ((title: string) => string)[]> = {
  friendly: [
    (t) => `${t} sorted without any drama — a clear price up front and a tidy finish every time.`,
    (t) => `Need ${t.toLowerCase()}? We'll talk you through the options and get it done properly.`,
    (t) => `${t} handled by people who care about the small details as much as the big ones.`,
  ],
  professional: [
    (t) => `${t} carried out to a high standard, with clear pricing agreed before work begins.`,
    (t) => `${t} planned and completed methodically, with everything explained along the way.`,
    (t) => `${t} delivered on schedule, with workmanship we are happy to stand behind.`,
  ],
  premium: [
    (t) =>
      `${t} delivered with care and precision, from the first visit through to the final finish.`,
    (t) => `${t} approached thoughtfully, using materials and methods chosen to last.`,
    (t) => `${t} finished to the standard we would expect in our own homes.`,
  ],
  'no-nonsense': [
    (t) => `${t} done properly, priced fairly and finished on schedule.`,
    (t) => `${t} — quoted up front, done right the first time, no surprises.`,
    (t) => `${t} without the runaround. We say what it costs and we stick to it.`,
  ],
}

const ABOUT_OPENERS: Record<Tone, (s: Slots) => string> = {
  friendly: (s) =>
    `${s.name} is a local ${s.label.toLowerCase()} business based in ${s.town}, built on tidy work and straight answers.`,
  professional: (s) =>
    `${s.name} provides ${s.label.toLowerCase()} services for homes across ${s.town}, with clear communication at every stage.`,
  premium: (s) =>
    `${s.name} takes a considered approach to ${s.label.toLowerCase()} in ${s.town}, from the first conversation to the final walkthrough.`,
  'no-nonsense': (s) =>
    `${s.name} does ${s.label.toLowerCase()} in ${s.town}. We quote it, we do it, we clear up after ourselves.`,
}

const ABOUT_CLOSERS: Record<Tone, string> = {
  friendly:
    "You'll get a clear price before any work starts, honest advice about what's worth doing, and a tidy home when we leave.",
  professional:
    'Every job starts with a written quote and finishes with a walkthrough, so you always know exactly what was done and why.',
  premium:
    'We take on a small number of projects at a time, so every client gets our full attention from start to finish.',
  'no-nonsense':
    'Clear price first. Work done when we said it would be. No surprises on the invoice.',
}

const CTA_LABELS: Record<Tone, string> = {
  friendly: 'Get a free quote',
  professional: 'Request a quote',
  premium: 'Arrange a visit',
  'no-nonsense': 'Get a price',
}

const STRAPLINES: Record<Tone, (s: Slots) => string> = {
  friendly: (s) => `Friendly ${s.label.toLowerCase()} in ${s.town}`,
  professional: (s) => `${s.label} you can rely on in ${s.town}`,
  premium: (s) => `Considered ${s.label.toLowerCase()} in ${s.town}`,
  'no-nonsense': (s) => `${s.label} in ${s.town}, done properly`,
}

const CONTACT_HEADINGS: Record<Tone, string> = {
  friendly: 'Tell us what needs doing',
  professional: 'Request your quote',
  premium: 'Start the conversation',
  'no-nonsense': 'Get a price today',
}

function serviceTitles(facts: BusinessFacts): string[] {
  const titles = facts.services.slice(0, 9).map((s) => s.value.slice(0, 48))
  for (const generic of GENERIC_SERVICES[facts.trade]) {
    if (titles.length >= 3) break
    if (!titles.some((t) => t.toLowerCase() === generic.toLowerCase())) titles.push(generic)
  }
  return titles
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
