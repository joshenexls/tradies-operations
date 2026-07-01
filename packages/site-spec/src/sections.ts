import { z } from 'zod'
import { accreditationIdSchema } from './facts'

/**
 * Section slots. Every section is a discriminated union member with a fixed
 * set of variants that exist as hand-crafted React components in
 * @tradies/templates. Copy fields carry hard length limits so generated text
 * can never break the layouts.
 *
 * Deliberately absent by design (compliance, not oversight):
 *  - a "testimonials" section — stored review text is unrepresentable
 *    (Google ToS + DMCC fake-reviews regime). Social proof is the live
 *    Google widget (by place_id) or evidenced trust badges only.
 */

/** Reference into a curated, license-clean imagery pool on R2. */
export const imageRefSchema = z.object({
  /** Pool id, e.g. "plumbing-modern" — resolved by the renderer. */
  pool: z.string().min(1),
  /** Index into the pool (stable selection). */
  index: z.number().int().min(0),
  alt: z.string().min(3).max(160),
})
export type ImageRef = z.infer<typeof imageRefSchema>

const headline = z.string().min(8).max(80)
const subheadline = z.string().min(16).max(200)
const shortLabel = z.string().min(2).max(32)
const paragraph = z.string().min(40).max(600)

export const heroSectionSchema = z.object({
  kind: z.literal('hero'),
  variant: z.enum(['classic', 'split', 'overlay']),
  headline,
  subheadline,
  ctaLabel: shortLabel,
  image: imageRefSchema,
  /** Badge ids shown under the CTA — must be evidenced accreditations. */
  badges: z.array(accreditationIdSchema).max(4).default([]),
})

export const servicesSectionSchema = z.object({
  kind: z.literal('services'),
  variant: z.enum(['grid', 'cards', 'list']),
  heading: headline,
  intro: subheadline.optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(3).max(48),
        description: z.string().min(30).max(220),
        icon: z
          .enum([
            'wrench',
            'droplet',
            'flame',
            'bolt',
            'plug',
            'lightbulb',
            'house',
            'hammer',
            'shield',
            'clock',
            'thermometer',
            'sun',
          ])
          .optional(),
      }),
    )
    .min(3)
    .max(9),
})

export const aboutSectionSchema = z.object({
  kind: z.literal('about'),
  variant: z.enum(['portrait', 'story']),
  heading: headline,
  paragraphs: z.array(paragraph).min(1).max(3),
  image: imageRefSchema.optional(),
  /**
   * Numeric highlights ("Established 2008"). Values repeated here must be
   * grounded in the facts sheet — FACT-GUARD cross-checks.
   */
  highlights: z
    .array(z.object({ label: z.string().min(2).max(40), value: z.string().min(1).max(24) }))
    .max(3)
    .default([]),
})

export const serviceAreaSectionSchema = z.object({
  kind: z.literal('serviceArea'),
  variant: z.enum(['chips', 'columns']),
  heading: headline,
  blurb: subheadline.optional(),
  areas: z.array(z.string().min(2).max(40)).min(1).max(24),
})

export const gallerySectionSchema = z.object({
  kind: z.literal('gallery'),
  variant: z.enum(['grid', 'strip']),
  heading: headline.optional(),
  images: z.array(imageRefSchema).min(3).max(9),
})

/** Social proof without stored reviews: live Google widget or nothing. */
export const reviewsSectionSchema = z.object({
  kind: z.literal('reviews'),
  variant: z.enum(['live-google']),
  heading: headline.optional(),
  /** Rendered only when the tenant has a place_id at render time. */
})

export const trustSectionSchema = z.object({
  kind: z.literal('trust'),
  variant: z.enum(['badges', 'banner']),
  heading: headline.optional(),
  badges: z.array(accreditationIdSchema).min(1).max(6),
})

export const faqSectionSchema = z.object({
  kind: z.literal('faq'),
  variant: z.enum(['accordion', 'two-column']),
  heading: headline,
  items: z
    .array(
      z.object({
        question: z.string().min(10).max(120),
        answer: z.string().min(30).max(500),
      }),
    )
    .min(3)
    .max(8),
})

export const contactSectionSchema = z.object({
  kind: z.literal('contact'),
  variant: z.enum(['split-form', 'banner']),
  heading: headline,
  blurb: subheadline.optional(),
  showPhone: z.boolean().default(true),
  showLeadForm: z.boolean().default(true),
  hoursNote: z.string().max(120).optional(),
})

export const sectionSchema = z.discriminatedUnion('kind', [
  heroSectionSchema,
  servicesSectionSchema,
  aboutSectionSchema,
  serviceAreaSectionSchema,
  gallerySectionSchema,
  reviewsSectionSchema,
  trustSectionSchema,
  faqSectionSchema,
  contactSectionSchema,
])

export type Section = z.infer<typeof sectionSchema>
export type SectionKind = Section['kind']

export const SECTION_KINDS = [
  'hero',
  'services',
  'about',
  'serviceArea',
  'gallery',
  'reviews',
  'trust',
  'faq',
  'contact',
] as const satisfies readonly SectionKind[]

/** variant ids per section kind — single source for presets/library UI. */
export const SECTION_VARIANTS: Record<SectionKind, readonly string[]> = {
  hero: ['classic', 'split', 'overlay'],
  services: ['grid', 'cards', 'list'],
  about: ['portrait', 'story'],
  serviceArea: ['chips', 'columns'],
  gallery: ['grid', 'strip'],
  reviews: ['live-google'],
  trust: ['badges', 'banner'],
  faq: ['accordion', 'two-column'],
  contact: ['split-form', 'banner'],
}
