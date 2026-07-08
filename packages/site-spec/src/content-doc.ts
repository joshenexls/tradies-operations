import { z } from 'zod'
import { businessFactsSchema } from './facts'
import { imageRefSchema } from './sections'
import { siteSpecSchema, type SiteSpec } from './site-spec'
import type { SlotManifest } from './slot-manifest'

/**
 * The content document is the LLM's output for an html-kind design system:
 * pure content keyed by the template's slot manifest. The runtime schema is
 * BUILT FROM the manifest, so length/count constraints are enforced at the
 * moment of emission (tool-forced structured output), not after.
 */

export type ContentDoc = {
  slots: Record<string, string>
  repeats: Record<string, Record<string, string>[]>
  images: Record<string, z.infer<typeof imageRefSchema>>
  repeatImages: Record<string, z.infer<typeof imageRefSchema>[]>
}

export function contentDocSchemaFor(manifest: SlotManifest, opts: { imageryPool: string }) {
  const slotShape: Record<string, z.ZodType<string>> = {}
  for (const slot of manifest.slots) {
    slotShape[slot.id] = z.string().min(slot.minLength).max(slot.maxLength)
  }
  const repeatShape: Record<string, z.ZodTypeAny> = {}
  const repeatImagesShape: Record<string, z.ZodTypeAny> = {}
  for (const group of manifest.repeats) {
    const itemShape: Record<string, z.ZodType<string>> = {}
    for (const slot of group.itemSlots) {
      itemShape[slot.id] = z.string().min(slot.minLength).max(slot.maxLength)
    }
    repeatShape[group.id] = z.array(z.object(itemShape)).min(group.minItems).max(group.maxItems)
    if (group.itemImages.length > 0) {
      repeatImagesShape[group.id] = z
        .array(poolImageSchema(opts.imageryPool))
        .min(group.minItems)
        .max(group.maxItems)
    }
  }
  const imagesShape: Record<string, z.ZodTypeAny> = {}
  for (const image of manifest.images) {
    imagesShape[image.id] = poolImageSchema(opts.imageryPool)
  }
  return z.object({
    slots: z.object(slotShape),
    repeats: z.object(repeatShape),
    images: z.object(imagesShape),
    repeatImages: z.object(repeatImagesShape).default({}),
  })
}

function poolImageSchema(imageryPool: string) {
  return imageRefSchema.refine((ref) => ref.pool === imageryPool, {
    message: `image pool must be "${imageryPool}"`,
  })
}

/** Loose shape for reading stored html-kind specs back out of site_specs. */
export const htmlSpecDocSchema = z.object({
  kind: z.literal('html'),
  designTemplateId: z.string().uuid(),
  contentDoc: z.object({
    slots: z.record(z.string(), z.string()),
    repeats: z.record(z.string(), z.array(z.record(z.string(), z.string()))),
    images: z.record(z.string(), imageRefSchema),
    repeatImages: z.record(z.string(), z.array(imageRefSchema)).default({}),
  }),
  facts: businessFactsSchema,
})
export type HtmlSpecDoc = z.infer<typeof htmlSpecDocSchema>

export type StoredSpec = { kind: 'component'; spec: SiteSpec } | { kind: 'html'; doc: HtmlSpecDoc }

/**
 * Discriminates the widened site_specs.spec column. Legacy component specs
 * have no top-level `kind`; html docs always do.
 */
export function parseStoredSpec(data: unknown): StoredSpec {
  if (data && typeof data === 'object' && (data as { kind?: unknown }).kind === 'html') {
    return { kind: 'html', doc: htmlSpecDocSchema.parse(data) }
  }
  return { kind: 'component', spec: siteSpecSchema.parse(data) }
}
