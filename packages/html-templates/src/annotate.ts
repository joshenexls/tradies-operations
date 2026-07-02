import { contains, load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import { z } from 'zod'
import { slotKindSchema, slotManifestSchema } from '@tradies/site-spec'
import type { RepeatGroup, SlotDef, SlotKind, SlotManifest } from '@tradies/site-spec'

/**
 * Annotation OPS are located by the LLM ingestor but APPLIED here,
 * deterministically. The manifest is assembled only from ops that actually
 * matched the DOM, then parsed through the frozen slotManifestSchema — the
 * LLM never writes the manifest directly.
 */

type DomElement = ReturnType<CheerioAPI> extends Cheerio<infer T> ? T : never

const selectorSchema = z.string().min(1)
/** Mirrors the (unexported) slot id shape in @tradies/site-spec. */
const opIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .min(2)
  .max(48)

export const annotationOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('slot'),
    selector: selectorSchema,
    id: opIdSchema,
    kind: slotKindSchema,
  }),
  z.object({
    op: z.literal('repeat'),
    selector: selectorSchema,
    id: opIdSchema,
    /** Relative to the group element. */
    itemSelector: selectorSchema,
    minItems: z.number().int().min(1),
    maxItems: z.number().int().min(1).max(12),
    /** Selectors relative to one item element. */
    itemSlots: z
      .array(z.object({ selector: selectorSchema, id: opIdSchema, kind: slotKindSchema }))
      .min(1),
    itemImages: z.array(z.object({ selector: selectorSchema, id: opIdSchema })).default([]),
  }),
  z.object({ op: z.literal('image'), selector: selectorSchema, id: opIdSchema }),
  z.object({
    op: z.literal('strip'),
    selector: selectorSchema,
    id: opIdSchema,
    reason: z.enum(['testimonials', 'reviews', 'other']),
  }),
  z.object({ op: z.literal('form'), selector: selectorSchema }),
  z.object({ op: z.literal('phone-link'), selector: selectorSchema }),
  // location surfaces, filled in code at render (never LLM copy):
  z.object({ op: z.literal('map'), selector: selectorSchema }),
  z.object({ op: z.literal('reviews-link'), selector: selectorSchema }),
])
export type AnnotationOp = z.infer<typeof annotationOpSchema>
export type AnnotationOpInput = z.input<typeof annotationOpSchema>

export type ApplyAnnotationsResult = {
  annotatedHtml: string
  manifest: SlotManifest
  sampleTexts: Record<string, string>
  unmatched: AnnotationOp[]
}

/**
 * Identity kinds carry the business's REAL values verbatim (FACT-GUARD
 * requires exact matches), so their limits can't be derived from the lander's
 * placeholder copy — "The Workshop" must not cap a real 40-char trading name.
 */
const KIND_MAX_LENGTH_FLOOR: Partial<Record<SlotKind, number>> = {
  'business-name': 100,
  email: 100,
  phone: 32,
  'seo-title': 70,
}

/** maxLength derived from the lander's existing text: clamp(ceil(len*1.4), 24, 600), with identity-kind floors. */
export function deriveMaxLength(sample: string, kind?: SlotKind): number {
  const derived = Math.min(600, Math.max(24, Math.ceil(sample.length * 1.4)))
  return Math.max(derived, (kind && KIND_MAX_LENGTH_FLOOR[kind]) || 0)
}

/** For <meta> targets the copy lives in the content attribute, not text. */
function captureSample(el: Cheerio<DomElement>): string {
  const raw = el.is('meta') ? (el.attr('content') ?? '') : el.text()
  return raw.replace(/\s+/g, ' ').trim()
}

function toSlotDef(id: string, kind: SlotKind, sample: string): SlotDef {
  return { id, kind, maxLength: deriveMaxLength(sample, kind), minLength: 1, required: true }
}

export function applyAnnotations(
  sanitizedHtml: string,
  ops: AnnotationOpInput[],
): ApplyAnnotationsResult {
  const $ = load(sanitizedHtml)
  const slots: SlotDef[] = []
  const repeats: RepeatGroup[] = []
  const images: { id: string }[] = []
  const strippedRegions: { id: string; reason: 'testimonials' | 'reviews' | 'other' }[] = []
  let formPresent = false
  const sampleTexts: Record<string, string> = {}
  const unmatched: AnnotationOp[] = []

  for (const raw of ops) {
    const op = annotationOpSchema.parse(raw)
    switch (op.op) {
      case 'slot': {
        const matches = $(op.selector)
        if (matches.length !== 1) {
          unmatched.push(op)
          break
        }
        const el = matches.first()
        const sample = captureSample(el)
        el.attr('data-slot', op.id).attr('data-slot-kind', op.kind)
        sampleTexts[op.id] = sample
        slots.push(toSlotDef(op.id, op.kind, sample))
        break
      }

      case 'repeat': {
        const groups = $(op.selector)
        if (groups.length !== 1) {
          unmatched.push(op)
          break
        }
        const group = groups.first()
        const items = group.find(op.itemSelector)
        const templateNode = items.get(0)
        if (!templateNode) {
          unmatched.push(op)
          break
        }
        const template = items.first()
        // pre-flight: every item slot/image must resolve inside the template
        // BEFORE any mutation, so a bad op leaves the DOM untouched
        const resolvedSlots = op.itemSlots.map((slot) => ({
          slot,
          el: template.find(slot.selector).first(),
        }))
        const resolvedImages = op.itemImages.map((image) => ({
          image,
          el: template.find(image.selector).filter('img').first(),
        }))
        if (
          resolvedSlots.some((r) => r.el.length === 0) ||
          resolvedImages.some((r) => r.el.length === 0)
        ) {
          unmatched.push(op)
          break
        }

        group.attr('data-repeat', op.id)
        template.attr('data-repeat-item', '')
        // the renderer clones the template, so the other original items go
        for (const node of items.toArray().slice(1)) {
          if (node === templateNode || contains(templateNode, node)) continue
          $(node).remove()
        }

        const itemSlots: SlotDef[] = []
        for (const { slot, el } of resolvedSlots) {
          const sample = captureSample(el)
          el.attr('data-slot', slot.id).attr('data-slot-kind', slot.kind)
          sampleTexts[`${op.id}.${slot.id}`] = sample
          itemSlots.push(toSlotDef(slot.id, slot.kind, sample))
        }
        for (const { image, el } of resolvedImages) {
          el.attr('data-slot-img', image.id).attr('src', '').removeAttr('data-img-pending')
        }
        repeats.push({
          id: op.id,
          minItems: op.minItems,
          maxItems: op.maxItems,
          itemSlots,
          itemImages: op.itemImages.map((image) => ({ id: image.id })),
        })
        break
      }

      case 'image': {
        const matches = $(op.selector).filter('img')
        if (matches.length === 0) {
          unmatched.push(op)
          break
        }
        matches.first().attr('data-slot-img', op.id).attr('src', '').removeAttr('data-img-pending')
        images.push({ id: op.id })
        break
      }

      case 'strip': {
        // deterministic DMCC stripping: the LLM only locates, this code removes
        const matches = $(op.selector)
        if (matches.length === 0) {
          unmatched.push(op)
          break
        }
        matches.remove()
        strippedRegions.push({ id: op.id, reason: op.reason })
        break
      }

      case 'form': {
        const matches = $(op.selector)
        if (matches.length !== 1 || !matches.first().is('form')) {
          unmatched.push(op)
          break
        }
        matches.first().attr('data-form', 'lead')
        formPresent = true
        break
      }

      case 'phone-link': {
        const matches = $(op.selector).filter('a')
        if (matches.length === 0) {
          unmatched.push(op)
          break
        }
        matches.attr('data-phone-href', '')
        break
      }

      case 'map': {
        // the keyless Google Maps iframe — the lander's placeholder src is
        // already sanitizer-approved; render swaps in the real location query
        const matches = $(op.selector).filter('iframe')
        if (matches.length === 0) {
          unmatched.push(op)
          break
        }
        matches.first().attr('data-map-embed', '')
        break
      }

      case 'reviews-link': {
        const matches = $(op.selector).filter('a')
        if (matches.length === 0) {
          unmatched.push(op)
          break
        }
        matches.attr('data-reviews-link', '')
        break
      }
    }
  }

  const manifest = slotManifestSchema.parse({
    manifestVersion: 1,
    slots,
    repeats,
    images,
    form: { present: formPresent },
    strippedRegions,
  })

  return { annotatedHtml: $.html(), manifest, sampleTexts, unmatched }
}
