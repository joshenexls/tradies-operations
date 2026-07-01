import { z } from 'zod'
import { businessFactsSchema } from './facts'
import { sectionSchema } from './sections'
import { themeSchema } from './theme'
import { tradeSchema } from './trades'

/**
 * The SiteSpec: the complete, validated description of one generated website.
 * The LLM produces THIS (data), never code. renderSite(spec, templates) in
 * @tradies/templates turns it into a page deterministically.
 */

export const SPEC_VERSION = 1

export const seoSchema = z.object({
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(160),
})

export const identitySchema = z.object({
  businessName: z.string().min(1).max(80),
  trade: tradeSchema,
  town: z.string().min(1).max(60),
  /** Display phone — must match the facts sheet exactly (FACT-GUARD). */
  phone: z.string().min(7).max(20).optional(),
  email: z.string().email().optional(),
  /** Strapline under the logo/name in header + footer. */
  strapline: z.string().min(6).max(80).optional(),
})

export const siteSpecSchema = z.object({
  specVersion: z.literal(SPEC_VERSION),
  templateId: z.string().min(1),
  identity: identitySchema,
  theme: themeSchema,
  sections: z
    .array(sectionSchema)
    .min(4)
    .max(9)
    // exactly one hero, first; exactly one contact, last
    .refine((sections) => sections[0]?.kind === 'hero', {
      message: 'first section must be the hero',
    })
    .refine((sections) => sections.filter((s) => s.kind === 'hero').length === 1, {
      message: 'exactly one hero section',
    })
    .refine((sections) => sections[sections.length - 1]?.kind === 'contact', {
      message: 'last section must be contact',
    })
    .refine((sections) => sections.filter((s) => s.kind === 'contact').length === 1, {
      message: 'exactly one contact section',
    })
    .refine(
      (sections) => {
        const kinds = sections.map((s) => s.kind)
        return new Set(kinds).size === kinds.length
      },
      { message: 'section kinds must not repeat' },
    ),
  seo: seoSchema,
  /** The facts sheet this spec was generated from — embedded for audit + FACT-GUARD. */
  facts: businessFactsSchema,
})

export type SiteSpec = z.infer<typeof siteSpecSchema>

export type SiteSpecInput = z.input<typeof siteSpecSchema>

export function parseSiteSpec(data: unknown): SiteSpec {
  return siteSpecSchema.parse(data)
}

export function safeParseSiteSpec(data: unknown) {
  return siteSpecSchema.safeParse(data)
}
