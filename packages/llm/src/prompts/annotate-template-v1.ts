export type AnnotateTemplatePromptInput = {
  html: string
  hints: { name: string }
  feedback?: string
}

export type AnnotateTemplatePrompt = {
  system: string
  user: string
  version: 'annotate-template-v1'
}

/** Keep the uploaded lander well inside the context window; note truncation. */
export const ANNOTATE_TEMPLATE_HTML_LIMIT = 120_000

/**
 * The prompt is persuasion only — the hard guarantees live downstream: the
 * annotation engine drops ops whose selectors do not match, and the derived
 * manifest (never the raw ops) is what generation runs from.
 */
export function buildAnnotateTemplatePrompt(
  input: AnnotateTemplatePromptInput,
): AnnotateTemplatePrompt {
  const { html, hints, feedback } = input

  const system = [
    'You annotate uploaded HTML landing-page templates for UK tradespeople so their copy can be regenerated per business. You must respond by calling the emit_annotations tool exactly once with JSON that matches its schema — no prose.',
    '',
    'Identify and annotate:',
    '- Content regions as slot ops: the main headline, subheadline, call-to-action labels, phone numbers, business name, about paragraphs, and the SEO <title> and meta description. Choose the slot kind that matches each region.',
    '- Repeat groups as repeat ops: service cards, FAQ items, gallery grids, area chips. Set itemSelector to the repeated element, describe each text slot inside one item in itemSlots, list images inside one item in itemImages, and set minItems/maxItems sensibly around the current item count (e.g. 3 items on the page → minItems 2-3, maxItems 5-6, never more than 12).',
    '- Standalone content images as image ops (decorative/background images are not slots).',
    '- THE contact form as a single form op (the one visitors submit enquiries through).',
    '- Every tel: link as a phone-link op.',
    '',
    'Strip rule (non-negotiable): mark every testimonial, review, rating or star block with a strip op (reason "testimonials" or "reviews"). These blocks contain fabricated quotes — keeping them is illegal under the UK DMCC fake-reviews regime. When in doubt, strip with reason "other".',
    '',
    'Selector rules:',
    '- Every selector must be a valid CSS selector that matches exactly one element in the document (item selectors match one element per repeated item).',
    '- Prefer ids and existing classes; fall back to :nth-of-type() only when neither is available. Never invent attributes that are not in the HTML.',
    '- Slot and repeat ids must be short kebab-case identifiers, unique across the whole document.',
  ].join('\n')

  const truncated = html.length > ANNOTATE_TEMPLATE_HTML_LIMIT
  const pageHtml = truncated ? html.slice(0, ANNOTATE_TEMPLATE_HTML_LIMIT) : html

  const user = [
    `Template name: ${hints.name}`,
    '',
    'Template HTML:',
    '',
    pageHtml,
    ...(truncated
      ? ['', `[Note: HTML truncated at ${ANNOTATE_TEMPLATE_HTML_LIMIT} characters.]`]
      : []),
    '',
    'Annotate the template now by calling emit_annotations.',
    ...(feedback ? ['', 'Problems with the previous attempt — fix them:', feedback] : []),
  ].join('\n')

  return { system, user, version: 'annotate-template-v1' }
}
