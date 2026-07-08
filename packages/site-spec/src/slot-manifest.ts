import { z } from 'zod'

/**
 * The slot manifest describes the fillable regions of an uploaded HTML design
 * system after ingest annotation. It is derived deterministically from the
 * annotated DOM (never trusted from the LLM directly) and drives both the
 * runtime content-doc schema and the renderer.
 */

export const slotKindSchema = z.enum([
  'headline',
  'subheadline',
  'paragraph',
  'short-label',
  'cta-label',
  'business-name',
  'phone',
  'email',
  'area',
  'seo-title',
  'seo-description',
  'img-alt',
])
export type SlotKind = z.infer<typeof slotKindSchema>

const slotId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .min(2)
  .max(48)

export const slotDefSchema = z.object({
  id: slotId,
  kind: slotKindSchema,
  /** Derived from the lander's existing text: clamp(ceil(len*1.4), 24, 600). */
  maxLength: z.number().int().min(8).max(600),
  minLength: z.number().int().min(1).default(1),
  required: z.boolean().default(true),
})
export type SlotDef = z.infer<typeof slotDefSchema>

export const repeatGroupSchema = z.object({
  id: slotId,
  minItems: z.number().int().min(1),
  maxItems: z.number().int().min(1).max(12),
  /** Slot ids scoped within one repeated item. */
  itemSlots: z.array(slotDefSchema).min(1),
  itemImages: z.array(z.object({ id: slotId })).default([]),
})
export type RepeatGroup = z.infer<typeof repeatGroupSchema>

export const strippedRegionSchema = z.object({
  id: slotId,
  reason: z.enum(['testimonials', 'reviews', 'other']),
})

export const slotManifestSchema = z.object({
  manifestVersion: z.literal(1),
  slots: z.array(slotDefSchema),
  repeats: z.array(repeatGroupSchema),
  /** Standalone data-slot-img targets (repeat item images live in repeats). */
  images: z.array(z.object({ id: slotId })),
  form: z.object({ present: z.boolean() }),
  /** DMCC record: dummy testimonial/review blocks removed at ingest. */
  strippedRegions: z.array(strippedRegionSchema),
})
export type SlotManifest = z.infer<typeof slotManifestSchema>
