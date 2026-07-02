import type { BusinessFacts, StylePreset, Trade } from '@tradies/site-spec'

/**
 * Shared deterministic-copy toolkit for every fixture LLM: the string-hash +
 * PRNG and the tone phrase tables. Extracted from fixture-llm.ts so the
 * component-spec fixture (FixtureLLM) and the html content-doc fixture
 * (FixtureContentDocGenerator) draw from one vocabulary. Copy only ever
 * states what the facts sheet evidences, so anything composed from these
 * tables passes FACT-GUARD by construction.
 */

export type Tone = StylePreset['tone']

export type Slots = { name: string; town: string; label: string; noun: string }

export function hashSeed(input: string): number {
  // FNV-1a, folded to uint32 — stable across runs and platforms
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: () => number, options: readonly T[]): T {
  const choice = options[Math.floor(rng() * options.length)]
  if (choice === undefined) throw new Error('cannot pick from an empty list')
  return choice
}

export const TRADE_NOUNS: Record<Trade, string> = {
  plumber: 'plumbers',
  electrician: 'electricians',
  roofer: 'roofers',
  builder: 'builders',
  heating: 'heating engineers',
  other: 'property specialists',
}

/** Non-factual filler titles used only to reach a section's item minimum. */
export const GENERIC_SERVICES: Record<Trade, readonly string[]> = {
  plumber: ['General plumbing', 'Leak repairs', 'Tap and toilet repairs'],
  electrician: ['Lighting installation', 'Fault finding', 'Extra sockets and switches'],
  roofer: ['Roof repairs', 'Gutter clearing', 'Roof inspections'],
  builder: ['General building work', 'Home repairs', 'Property maintenance'],
  heating: ['Boiler servicing', 'Radiator repairs', 'Heating system checks'],
  other: ['General repairs', 'Odd jobs and fixes', 'Property maintenance'],
}

export const HEADLINES: Record<Tone, readonly ((s: Slots) => string)[]> = {
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

export const SUBHEADLINE_TAILS: Record<Tone, (town: string) => string> = {
  friendly: (town) => `we're here to help homes across ${town}.`,
  professional: (town) => `we deliver dependable work for homes across ${town}.`,
  premium: (town) => `every detail is handled with care for homes across ${town}.`,
  'no-nonsense': (town) => `we turn up, sort it and clear up, right across ${town}.`,
}

export const SERVICE_DESCRIPTIONS: Record<Tone, readonly ((title: string) => string)[]> = {
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

export const ABOUT_OPENERS: Record<Tone, (s: Slots) => string> = {
  friendly: (s) =>
    `${s.name} is a local ${s.label.toLowerCase()} business based in ${s.town}, built on tidy work and straight answers.`,
  professional: (s) =>
    `${s.name} provides ${s.label.toLowerCase()} services for homes across ${s.town}, with clear communication at every stage.`,
  premium: (s) =>
    `${s.name} takes a considered approach to ${s.label.toLowerCase()} in ${s.town}, from the first conversation to the final walkthrough.`,
  'no-nonsense': (s) =>
    `${s.name} does ${s.label.toLowerCase()} in ${s.town}. We quote it, we do it, we clear up after ourselves.`,
}

export const ABOUT_CLOSERS: Record<Tone, string> = {
  friendly:
    "You'll get a clear price before any work starts, honest advice about what's worth doing, and a tidy home when we leave.",
  professional:
    'Every job starts with a written quote and finishes with a walkthrough, so you always know exactly what was done and why.',
  premium:
    'We take on a small number of projects at a time, so every client gets our full attention from start to finish.',
  'no-nonsense':
    'Clear price first. Work done when we said it would be. No surprises on the invoice.',
}

export const CTA_LABELS: Record<Tone, string> = {
  friendly: 'Get a free quote',
  professional: 'Request a quote',
  premium: 'Arrange a visit',
  'no-nonsense': 'Get a price',
}

export const STRAPLINES: Record<Tone, (s: Slots) => string> = {
  friendly: (s) => `Friendly ${s.label.toLowerCase()} in ${s.town}`,
  professional: (s) => `${s.label} you can rely on in ${s.town}`,
  premium: (s) => `Considered ${s.label.toLowerCase()} in ${s.town}`,
  'no-nonsense': (s) => `${s.label} in ${s.town}, done properly`,
}

export const CONTACT_HEADINGS: Record<Tone, string> = {
  friendly: 'Tell us what needs doing',
  professional: 'Request your quote',
  premium: 'Start the conversation',
  'no-nonsense': 'Get a price today',
}

/** Generic, always-grounded FAQ copy (town is the only fact referenced). */
export const FAQ_ITEMS: readonly { question: string; answer: (town: string) => string }[] = [
  {
    question: 'Which areas do you cover?',
    answer: (town) =>
      `We're based in ${town} and cover the areas listed on this page. If you're just outside them, ask — we can often help.`,
  },
  {
    question: 'How do I get a quote?',
    answer: () =>
      "Send a few details through the contact form or give us a call. We'll take a look and come back with a clear price.",
  },
  {
    question: 'When can you fit the work in?',
    answer: () =>
      "We'll be upfront about lead times when you get in touch, and we'll agree a date that suits you before anything starts.",
  },
  {
    question: 'Do you tidy up afterwards?',
    answer: () =>
      'Yes — we treat your home with respect and leave every work area clean and tidy before we go.',
  },
]

/** Evidenced service titles first, padded to three with trade-generic filler. */
export function serviceTitles(facts: BusinessFacts): string[] {
  const titles = facts.services.slice(0, 9).map((s) => s.value.slice(0, 48))
  for (const generic of GENERIC_SERVICES[facts.trade]) {
    if (titles.length >= 3) break
    if (!titles.some((t) => t.toLowerCase() === generic.toLowerCase())) titles.push(generic)
  }
  return titles
}
