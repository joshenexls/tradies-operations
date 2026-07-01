import type { StylePreset } from '@tradies/site-spec'
import { stylePresetSchema } from '@tradies/site-spec'

/**
 * Seed style presets shipped with the design system: three generic
 * directions (one per template family) plus three trade specialisations.
 * The library in the DB starts from these; operators add more without
 * redeploys. Every entry is parsed so a bad seed fails at import time.
 */

const heritageWeights = {
  hero: { classic: 1 },
  services: { grid: 0.55, list: 0.45 },
  about: { story: 0.6, portrait: 0.4 },
  serviceArea: { columns: 0.65, chips: 0.35 },
  gallery: { grid: 0.7, strip: 0.3 },
  trust: { badges: 0.7, banner: 0.3 },
  faq: { 'two-column': 0.65, accordion: 0.35 },
  contact: { 'split-form': 0.6, banner: 0.4 },
}

const modernWeights = {
  hero: { split: 0.7, classic: 0.2, overlay: 0.1 },
  services: { cards: 0.6, grid: 0.4 },
  about: { portrait: 0.65, story: 0.35 },
  serviceArea: { chips: 0.7, columns: 0.3 },
  gallery: { grid: 0.6, strip: 0.4 },
  trust: { badges: 0.6, banner: 0.4 },
  faq: { accordion: 0.7, 'two-column': 0.3 },
  contact: { 'split-form': 0.7, banner: 0.3 },
}

const boldWeights = {
  hero: { overlay: 1 },
  services: { grid: 0.55, cards: 0.45 },
  about: { story: 0.55, portrait: 0.45 },
  serviceArea: { chips: 0.6, columns: 0.4 },
  gallery: { strip: 0.55, grid: 0.45 },
  trust: { banner: 0.7, badges: 0.3 },
  faq: { accordion: 0.75, 'two-column': 0.25 },
  contact: { banner: 0.6, 'split-form': 0.4 },
}

export const SEED_STYLE_PRESETS: StylePreset[] = [
  {
    styleKey: 'heritage',
    name: 'Heritage',
    trade: null,
    templateId: 'classic',
    description: 'Established and trustworthy: centred masthead, serif headings, banded sections.',
    paletteId: 'navy-brass',
    fontPairId: 'fraunces-source',
    radius: 'sharp',
    variantWeights: heritageWeights,
    imageryPool: 'trades-heritage',
    tone: 'professional',
  },
  {
    styleKey: 'modern',
    name: 'Modern',
    trade: null,
    templateId: 'modern',
    description: 'Clean and confident: sticky header, split hero, rounded cards, soft shadows.',
    paletteId: 'graphite-amber',
    fontPairId: 'sora-inter',
    radius: 'round',
    variantWeights: modernWeights,
    imageryPool: 'trades-modern',
    tone: 'friendly',
  },
  {
    styleKey: 'bold',
    name: 'Bold',
    trade: null,
    templateId: 'bold',
    description: 'High impact: full-bleed overlay hero, oversized headings, chunky CTAs.',
    paletteId: 'royal-sky',
    fontPairId: 'archivo-inter',
    radius: 'sharp',
    variantWeights: boldWeights,
    imageryPool: 'trades-bold',
    tone: 'no-nonsense',
  },
  {
    styleKey: 'modern',
    name: 'Modern — Plumbing',
    trade: 'plumber',
    templateId: 'modern',
    description: 'The modern system tuned for plumbers: deep teal palette, plumbing imagery.',
    paletteId: 'deep-teal',
    fontPairId: 'sora-inter',
    radius: 'round',
    variantWeights: modernWeights,
    imageryPool: 'plumbing-modern',
    tone: 'friendly',
  },
  {
    styleKey: 'heritage',
    name: 'Heritage — Roofing',
    trade: 'roofer',
    templateId: 'classic',
    description: 'The heritage system tuned for roofers: brick and slate palette, roofing imagery.',
    paletteId: 'brick-slate',
    fontPairId: 'fraunces-source',
    radius: 'sharp',
    variantWeights: heritageWeights,
    imageryPool: 'roofing-heritage',
    tone: 'professional',
  },
  {
    styleKey: 'bold',
    name: 'Bold — Electrical',
    trade: 'electrician',
    templateId: 'bold',
    description:
      'The bold system tuned for electricians: royal and sky palette, electrical imagery.',
    paletteId: 'royal-sky',
    fontPairId: 'archivo-inter',
    radius: 'sharp',
    variantWeights: boldWeights,
    imageryPool: 'electrical-bold',
    tone: 'no-nonsense',
  },
].map((preset) => stylePresetSchema.parse(preset))
