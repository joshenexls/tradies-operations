import type { BusinessFacts, SlotDef, SlotManifest } from '@tradies/site-spec'

export type ContentDocPromptInput = {
  facts: BusinessFacts
  manifest: SlotManifest
  imageryPool: string
  tone: string
  /** Existing template copy per slot id (item slots may be keyed "group.slot"). */
  sampleTexts: Record<string, string>
  feedback?: string
}

export type ContentDocPrompt = {
  system: string
  user: string
  version: 'content-doc-v1'
}

function slotLine(slot: SlotDef, sample: string | undefined, indent = ''): string {
  const base = `${indent}- ${slot.id} (${slot.kind}, max ${slot.maxLength} chars)`
  return sample
    ? `${base} — sample: "${sample}" — match this energy and length, write fresh content for THIS business.`
    : base
}

/**
 * The prompt is persuasion only — the hard guarantees are the manifest-built
 * tool schema (lengths/counts enforced at emission) and FACT-GUARD
 * (validateContentDocAgainstFacts), which run on every candidate.
 */
export function buildContentDocPrompt(input: ContentDocPromptInput): ContentDocPrompt {
  const { facts, manifest, imageryPool, tone, sampleTexts, feedback } = input
  const areas = [...new Set([facts.town, ...facts.serviceAreas])]

  const system = [
    'You write website copy for UK tradespeople, filling the content slots of an existing HTML design system. You must respond by calling the emit_content_doc tool exactly once with JSON that matches its schema — no prose. The design is fixed; you only write the words and pick the images.',
    '',
    'Non-negotiable rules:',
    '- State only facts present in the facts sheet. Never invent services, service areas, history, qualifications or contact details.',
    '- Never write reviews, testimonials, star ratings, quotes from customers, or any review-like language. Social proof is handled elsewhere.',
    '- Claims such as insurance, guarantees, certifications or awards may appear only when the facts sheet contains a matching claim or accreditation.',
    `- Slots of kind "area" may only contain one of: ${areas.join(', ')}.`,
    `- Slots of kind "phone" must contain exactly ${facts.phone ? `"${facts.phone.value}"` : 'nothing — the facts sheet has no phone (write the business name instead of inventing one)'}.`,
    `- Slots of kind "email" must contain exactly ${facts.email ? `"${facts.email.value}"` : 'nothing — the facts sheet has no email (write the business name instead of inventing one)'}.`,
    `- Slots of kind "business-name" must contain exactly "${facts.businessName}".`,
    `- Images: pick an index from 0 to 5 in the "${imageryPool}" pool, with a short descriptive alt text for each.`,
    '',
    `Write all copy in UK English with a ${tone} tone. Respect every slot's max length — the schema rejects overruns.`,
  ].join('\n')

  const slotLines = manifest.slots.map((slot) => slotLine(slot, sampleTexts[slot.id]))
  const repeatLines = manifest.repeats.flatMap((group) => [
    `- ${group.id}: between ${group.minItems} and ${group.maxItems} items${group.itemImages.length > 0 ? ', each with an image' : ''}. Per item:`,
    ...group.itemSlots.map((slot) =>
      slotLine(slot, sampleTexts[`${group.id}.${slot.id}`] ?? sampleTexts[slot.id], '  '),
    ),
  ])
  const imageLines = manifest.images.map((image) => `- ${image.id}`)

  const user = [
    'Facts sheet (the only permitted source of factual claims):',
    JSON.stringify(facts, null, 2),
    '',
    'Slots to fill:',
    ...slotLines,
    ...(repeatLines.length > 0 ? ['', 'Repeat groups to fill:', ...repeatLines] : []),
    ...(imageLines.length > 0 ? ['', 'Standalone images to pick:', ...imageLines] : []),
    '',
    'Generate the complete content document now by calling emit_content_doc.',
    ...(feedback ? ['', 'Operator feedback on the previous attempt — address it:', feedback] : []),
  ].join('\n')

  return { system, user, version: 'content-doc-v1' }
}
