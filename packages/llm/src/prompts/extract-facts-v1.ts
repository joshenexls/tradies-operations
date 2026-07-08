import type { Trade } from '@tradies/site-spec'
import { ACCREDITATION_IDS, ACCREDITATION_LABELS, TRADE_LABELS } from '@tradies/site-spec'

export type ExtractFactsPromptInput = {
  businessName: string
  trade: Trade
  town: string
  markdown: string
}

export type ExtractFactsPrompt = {
  system: string
  user: string
  version: 'extract-facts-v1'
}

/** Keep the page text well inside the context window; note when we truncate. */
export const EXTRACT_FACTS_MARKDOWN_LIMIT = 40_000

/**
 * The prompt is persuasion only — the hard guarantee is verifyExtractedFacts,
 * which drops any fact whose quote is not verbatim in the scraped page.
 */
export function buildExtractFactsPrompt(input: ExtractFactsPromptInput): ExtractFactsPrompt {
  const { businessName, trade, town, markdown } = input

  const system = [
    `You extract verified business facts from a UK tradesperson's website. The business is ${businessName}, a ${TRADE_LABELS[trade].toLowerCase()} business in ${town}. You must respond by calling the emit_facts tool exactly once with JSON that matches its schema — no prose.`,
    '',
    'Extraction rules (non-negotiable):',
    '- Extract only facts explicitly present in the page text. No inference, no embellishment, no filling gaps from general knowledge.',
    '- Every fact must carry a `quote`: a short excerpt copied verbatim from the page text that evidences it. Do not paraphrase quotes.',
    '- Accreditations may only use ids from this allowed list:',
    ...ACCREDITATION_IDS.map((id) => `  - ${id} (${ACCREDITATION_LABELS[id]})`),
    '- If the page mentions an accreditation that is not on the list, omit it entirely.',
    '- Omit any field the page does not evidence. An empty result is better than a fabricated one.',
    '- Write extracted values in UK English.',
  ].join('\n')

  const truncated = markdown.length > EXTRACT_FACTS_MARKDOWN_LIMIT
  const pageText = truncated ? markdown.slice(0, EXTRACT_FACTS_MARKDOWN_LIMIT) : markdown

  const user = [
    'Page text (markdown) scraped from the business website:',
    '',
    pageText,
    ...(truncated
      ? ['', `[Note: page text truncated at ${EXTRACT_FACTS_MARKDOWN_LIMIT} characters.]`]
      : []),
    '',
    'Extract the evidenced facts now by calling emit_facts.',
  ].join('\n')

  return { system, user, version: 'extract-facts-v1' }
}
