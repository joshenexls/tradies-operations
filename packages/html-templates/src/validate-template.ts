import { load } from 'cheerio'
import { REVIEW_PATTERNS, looksLikeReviewContent } from '@tradies/site-spec'
import type { SlotManifest } from '@tradies/site-spec'
import { scanRemovableContent } from './sanitize'

/**
 * Structural gate between annotation and storage: the annotated template must
 * agree exactly with its manifest, still be sanitizer-clean, and carry no
 * review-shaped dummy copy outside slotted regions (the DMCC backstop for
 * testimonials the strip ops missed).
 */

export type TemplateValidationResult = { ok: boolean; problems: string[] }

export function validateAnnotatedTemplate(
  annotatedHtml: string,
  manifest: SlotManifest,
): TemplateValidationResult {
  const problems: string[] = []
  const $ = load(annotatedHtml)

  for (const slot of manifest.slots) {
    const count = $(`[data-slot="${slot.id}"]`).length
    if (count !== 1) {
      problems.push(`slot "${slot.id}" resolves to ${count} elements (expected exactly 1)`)
    }
  }

  for (const group of manifest.repeats) {
    const groupEl = $(`[data-repeat="${group.id}"]`)
    if (groupEl.length !== 1) {
      problems.push(
        `repeat "${group.id}" resolves to ${groupEl.length} group elements (expected exactly 1)`,
      )
      continue
    }
    const template = groupEl.find('[data-repeat-item]')
    if (template.length !== 1) {
      problems.push(
        `repeat "${group.id}" has ${template.length} [data-repeat-item] templates (expected exactly 1)`,
      )
      continue
    }
    for (const slot of group.itemSlots) {
      const count = template.find(`[data-slot="${slot.id}"]`).length
      if (count !== 1) {
        problems.push(
          `repeat "${group.id}" item slot "${slot.id}" resolves to ${count} elements in the template (expected exactly 1)`,
        )
      }
    }
    for (const image of group.itemImages) {
      const count = template.find(`[data-slot-img="${image.id}"]`).length
      if (count !== 1) {
        problems.push(
          `repeat "${group.id}" item image "${image.id}" resolves to ${count} elements in the template (expected exactly 1)`,
        )
      }
    }
  }

  for (const image of manifest.images) {
    const count = $(`img[data-slot-img="${image.id}"]`).length
    if (count !== 1) {
      problems.push(`image "${image.id}" resolves to ${count} <img> elements (expected exactly 1)`)
    }
  }

  const formCount = $('form[data-form="lead"]').length
  if (manifest.form.present && formCount !== 1) {
    problems.push(`manifest declares a lead form but found ${formCount} form[data-form="lead"]`)
  }
  if (!manifest.form.present && formCount !== 0) {
    problems.push(`manifest declares no lead form but found ${formCount} form[data-form="lead"]`)
  }

  // an annotated template must still be a sanitizer fixpoint
  for (const finding of scanRemovableContent(annotatedHtml)) {
    problems.push(`sanitizer re-scan: ${finding}`)
  }

  const h1Count = $('h1').length
  if (h1Count !== 1) {
    problems.push(`template has ${h1Count} <h1> elements (expected exactly 1)`)
  }

  const stripRemnants = $('[data-strip]').length
  if (stripRemnants > 0) {
    problems.push(
      `template has ${stripRemnants} [data-strip] remnants — strip regions must be removed at annotation time`,
    )
  }

  problems.push(...scanForReviewContent(annotatedHtml))

  return { ok: problems.length === 0, problems }
}

/**
 * Review-pattern scan over text that is NOT inside any [data-slot]/[data-repeat]
 * region — slotted copy is validated against the facts sheet elsewhere; this
 * catches unstripped dummy testimonials baked into the template itself.
 */
function scanForReviewContent(annotatedHtml: string): string[] {
  const $ = load(annotatedHtml)
  $('script, style, [data-slot], [data-repeat]').remove()
  const problems: string[] = []

  $('body *').each((_, node) => {
    const ownText = node.children
      .map((child) => (child.type === 'text' && 'data' in child ? child.data : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (ownText && looksLikeReviewContent(ownText)) {
      problems.push(`review-shaped content outside any slot: "${ownText.slice(0, 120)}"`)
    }
  })

  if (problems.length === 0) {
    // catch quote/attribution patterns split across sibling elements
    const whole = $('body').text().replace(/\s+/g, ' ').trim()
    for (const pattern of REVIEW_PATTERNS) {
      const match = whole.match(pattern)
      if (match) {
        problems.push(`review-shaped content outside any slot: "${match[0].slice(0, 120)}"`)
        break
      }
    }
  }

  return problems
}
