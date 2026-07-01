import { z } from 'zod'

/**
 * Theme tokens are always chosen from the curated registries below — the LLM
 * (and operators) select by id; free-form colors/fonts are not representable
 * in a SiteSpec. That is what keeps every generated site inside a design
 * system a human signed off on.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color like #1a2b3c')

export const paletteSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Primary brand color — buttons, links, section accents. */
  primary: hex,
  /** Text/icon color that passes contrast on primary. */
  onPrimary: hex,
  /** Page background. */
  surface: hex,
  /** Alternate band background for section rhythm. */
  surfaceAlt: hex,
  /** Body text. */
  ink: hex,
  /** Secondary text. */
  inkMuted: hex,
  /** Sparing highlight — badges, small accents. */
  accent: hex,
})
export type Palette = z.infer<typeof paletteSchema>

export const fontPairSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Google Fonts family name for headings. */
  heading: z.string(),
  /** Google Fonts family name for body copy. */
  body: z.string(),
  headingWeight: z.number().int().min(400).max(900).default(700),
})
export type FontPair = z.infer<typeof fontPairSchema>

/**
 * Curated palettes. Naming is trade-agnostic; presets map trades to palettes.
 * All pairs validated for WCAG AA contrast (ink on surface, onPrimary on primary).
 */
export const PALETTES: readonly Palette[] = [
  {
    id: 'navy-brass',
    name: 'Navy & Brass',
    primary: '#1c3d5a',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f2f5f8',
    ink: '#16232e',
    inkMuted: '#5a6b7a',
    accent: '#c9a227',
  },
  {
    id: 'deep-teal',
    name: 'Deep Teal',
    primary: '#0f5e5a',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#eef5f4',
    ink: '#122726',
    inkMuted: '#4f6664',
    accent: '#e0763c',
  },
  {
    id: 'graphite-amber',
    name: 'Graphite & Amber',
    primary: '#2b2f36',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f4f4f2',
    ink: '#1d2025',
    inkMuted: '#5f646d',
    accent: '#e8a13a',
  },
  {
    id: 'royal-sky',
    name: 'Royal & Sky',
    primary: '#1e4fd8',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#eef2fd',
    ink: '#141b2e',
    inkMuted: '#525d78',
    accent: '#12b5cb',
  },
  {
    id: 'forest-lime',
    name: 'Forest & Lime',
    primary: '#1f5130',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f0f5f0',
    ink: '#182b1e',
    inkMuted: '#54685a',
    accent: '#8bc34a',
  },
  {
    id: 'brick-slate',
    name: 'Brick & Slate',
    primary: '#8c3b2e',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f7f2f0',
    ink: '#2a201d',
    inkMuted: '#6b5c57',
    accent: '#3f5866',
  },
] as const

export const FONT_PAIRS: readonly FontPair[] = [
  {
    id: 'archivo-inter',
    name: 'Archivo / Inter',
    heading: 'Archivo',
    body: 'Inter',
    headingWeight: 700,
  },
  {
    id: 'fraunces-source',
    name: 'Fraunces / Source Sans 3',
    heading: 'Fraunces',
    body: 'Source Sans 3',
    headingWeight: 600,
  },
  {
    id: 'manrope-manrope',
    name: 'Manrope',
    heading: 'Manrope',
    body: 'Manrope',
    headingWeight: 800,
  },
  { id: 'sora-inter', name: 'Sora / Inter', heading: 'Sora', body: 'Inter', headingWeight: 700 },
  { id: 'bitter-lato', name: 'Bitter / Lato', heading: 'Bitter', body: 'Lato', headingWeight: 700 },
] as const

export const paletteIds = PALETTES.map((p) => p.id) as [string, ...string[]]
export const fontPairIds = FONT_PAIRS.map((f) => f.id) as [string, ...string[]]

export const themeSchema = z.object({
  paletteId: z.enum(paletteIds),
  fontPairId: z.enum(fontPairIds),
  /** Corner rounding personality. */
  radius: z.enum(['sharp', 'soft', 'round']).default('soft'),
})
export type Theme = z.infer<typeof themeSchema>

export function getPalette(id: string): Palette {
  const palette = PALETTES.find((p) => p.id === id)
  if (!palette) throw new Error(`Unknown palette: ${id}`)
  return palette
}

export function getFontPair(id: string): FontPair {
  const pair = FONT_PAIRS.find((f) => f.id === id)
  if (!pair) throw new Error(`Unknown font pair: ${id}`)
  return pair
}
