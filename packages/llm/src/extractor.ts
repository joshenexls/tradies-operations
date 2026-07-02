import Anthropic from '@anthropic-ai/sdk'
import { allProspectFixtures } from '@tradies/fixtures'
import type { AccreditationId, BusinessFacts, EvidencedFact, Trade } from '@tradies/site-spec'
import { ACCREDITATION_IDS } from '@tradies/site-spec'
import { z } from 'zod'
import type { AnthropicMessagesClient } from './anthropic-generator'
import type { TokenUsage } from './generator'
import { buildExtractFactsPrompt } from './prompts/extract-facts-v1'

/** Raw tool output — callers must run extractedFactsSchema + verifyExtractedFacts. */
export type ExtractedFactsCandidate = unknown

export type ExtractFactsInput = {
  businessName: string
  trade: Trade
  town: string
  markdown: string
}

export interface FactsExtractor {
  extractFacts(input: ExtractFactsInput): Promise<{
    candidate: ExtractedFactsCandidate
    model: string
    usage: TokenUsage
  }>
}

const quotedFactSchema = z.object({
  value: z.string().min(1),
  /** Verbatim excerpt from the page text evidencing the fact. */
  quote: z.string().min(1),
})

/**
 * The subset of businessFactsSchema the LLM may produce. Sources are NOT part
 * of the LLM contract — toBusinessFactsPatch stamps 'own_website' after parse.
 * Accreditation ids are deliberately loose strings here; verifyExtractedFacts
 * drops anything outside ACCREDITATION_IDS.
 */
export const extractedFactsSchema = z.object({
  services: z.array(quotedFactSchema).default([]),
  serviceAreas: z.array(z.string().min(1)).default([]),
  accreditations: z
    .array(z.object({ id: z.string().min(1), quote: z.string().min(1) }))
    .default([]),
  foundedYear: z
    .object({ value: z.number().int().min(1800).max(2100), quote: z.string().min(1) })
    .optional(),
  claims: z.array(quotedFactSchema).default([]),
  email: quotedFactSchema.optional(),
  phone: quotedFactSchema.optional(),
})
export type ExtractedFacts = z.infer<typeof extractedFactsSchema>

/** Extracted facts with the own_website source stamped, before verification. */
export type ExtractedFactsPatch = {
  services: EvidencedFact[]
  serviceAreas: string[]
  accreditations: { id: string; source: 'own_website'; quote?: string }[]
  foundedYear?: { value: number; source: 'own_website'; quote?: string }
  claims: EvidencedFact[]
  email?: EvidencedFact
  phone?: EvidencedFact
}

/** Post-verification patch: accreditation ids are proven members of the registry. */
export type VerifiedFactsPatch = Omit<ExtractedFactsPatch, 'accreditations'> & {
  accreditations: { id: AccreditationId; source: 'own_website'; quote?: string }[]
}

/** Stamps source 'own_website' on every fact the LLM produced. */
export function toBusinessFactsPatch(parsed: ExtractedFacts): ExtractedFactsPatch {
  const source = 'own_website' as const
  return {
    services: parsed.services.map((f) => ({ value: f.value, source, quote: f.quote })),
    serviceAreas: [...parsed.serviceAreas],
    accreditations: parsed.accreditations.map((a) => ({ id: a.id, source, quote: a.quote })),
    ...(parsed.foundedYear
      ? {
          foundedYear: { value: parsed.foundedYear.value, source, quote: parsed.foundedYear.quote },
        }
      : {}),
    claims: parsed.claims.map((f) => ({ value: f.value, source, quote: f.quote })),
    ...(parsed.email
      ? { email: { value: parsed.email.value, source, quote: parsed.email.quote } }
      : {}),
    ...(parsed.phone
      ? { phone: { value: parsed.phone.value, source, quote: parsed.phone.quote } }
      : {}),
  }
}

export type DroppedFact = { field: string; reason: string; quote?: string }

const normalizeWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * The extraction-side FACT-GUARD. Every fact must be evidenced by a quote
 * that appears verbatim (modulo whitespace) in the scraped markdown, and
 * accreditations must use registry ids — anything else is dropped, never
 * repaired. Dropped facts are returned for observability.
 */
export function verifyExtractedFacts(
  patch: ExtractedFactsPatch,
  markdown: string,
): { kept: VerifiedFactsPatch; dropped: DroppedFact[] } {
  const haystack = normalizeWhitespace(markdown)
  const dropped: DroppedFact[] = []

  const quoteOk = (quote: string | undefined): boolean =>
    quote !== undefined && quote.trim() !== '' && haystack.includes(normalizeWhitespace(quote))

  const drop = (field: string, reason: string, quote?: string) => {
    dropped.push({ field, reason, ...(quote !== undefined ? { quote } : {}) })
  }

  const keepEvidenced = (field: string, facts: EvidencedFact[]): EvidencedFact[] =>
    facts.filter((fact) => {
      if (quoteOk(fact.quote)) return true
      drop(
        field,
        fact.quote === undefined || fact.quote.trim() === ''
          ? 'missing quote'
          : 'quote not found verbatim in page text',
        fact.quote,
      )
      return false
    })

  const accreditations = patch.accreditations.flatMap(
    (acc): VerifiedFactsPatch['accreditations'] => {
      if (!(ACCREDITATION_IDS as readonly string[]).includes(acc.id)) {
        drop('accreditations', `unknown accreditation id: ${acc.id}`, acc.quote)
        return []
      }
      if (!quoteOk(acc.quote)) {
        drop(
          'accreditations',
          acc.quote === undefined || acc.quote.trim() === ''
            ? 'missing quote'
            : 'quote not found verbatim in page text',
          acc.quote,
        )
        return []
      }
      return [{ id: acc.id as AccreditationId, source: 'own_website', quote: acc.quote }]
    },
  )

  const kept: VerifiedFactsPatch = {
    services: keepEvidenced('services', patch.services),
    serviceAreas: [...patch.serviceAreas],
    accreditations,
    claims: keepEvidenced('claims', patch.claims),
  }

  if (patch.foundedYear) {
    if (quoteOk(patch.foundedYear.quote)) {
      kept.foundedYear = patch.foundedYear
    } else {
      drop(
        'foundedYear',
        patch.foundedYear.quote ? 'quote not found verbatim in page text' : 'missing quote',
        patch.foundedYear.quote,
      )
    }
  }
  if (patch.email) {
    if (quoteOk(patch.email.quote)) kept.email = patch.email
    else
      drop(
        'email',
        patch.email.quote ? 'quote not found verbatim in page text' : 'missing quote',
        patch.email.quote,
      )
  }
  if (patch.phone) {
    if (quoteOk(patch.phone.quote)) kept.phone = patch.phone
    else
      drop(
        'phone',
        patch.phone.quote ? 'quote not found verbatim in page text' : 'missing quote',
        patch.phone.quote,
      )
  }

  return { kept, dropped }
}

export const EMIT_FACTS_TOOL = 'emit_facts'

export type AnthropicFactsExtractorOptions = {
  apiKey?: string
  model?: string
  client?: AnthropicMessagesClient
}

/**
 * Structured extraction via forced tool use, mirroring AnthropicSiteSpecGenerator:
 * a single emit_facts tool whose input_schema is the zod extraction schema,
 * with tool_choice pinned to it.
 */
export class AnthropicFactsExtractor implements FactsExtractor {
  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(options: AnthropicFactsExtractorOptions = {}) {
    this.model = options.model ?? 'claude-haiku-4-5'
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async extractFacts(input: ExtractFactsInput): Promise<{
    candidate: ExtractedFactsCandidate
    model: string
    usage: TokenUsage
  }> {
    const prompt = buildExtractFactsPrompt(input)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      tools: [
        {
          name: EMIT_FACTS_TOOL,
          description:
            'Emit the evidenced business facts extracted from the page text as structured JSON matching the schema. Call exactly once.',
          input_schema: z.toJSONSchema(extractedFactsSchema) as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: EMIT_FACTS_TOOL },
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `Expected an ${EMIT_FACTS_TOOL} tool_use block, got none (stop_reason: ${response.stop_reason})`,
      )
    }

    return {
      candidate: toolUse.input,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }
}

function ownWebsite<T extends { source: string }>(facts: T[]): T[] {
  return facts.filter((f) => f.source === 'own_website')
}

/** Rebuilds the extraction-shaped candidate a fixture's facts sheet implies. */
function toExtractedCandidate(facts: BusinessFacts): ExtractedFacts {
  return extractedFactsSchema.parse({
    services: ownWebsite(facts.services).map((f) => ({
      value: f.value,
      quote: f.quote ?? f.value,
    })),
    serviceAreas: [...facts.serviceAreas],
    accreditations: ownWebsite(facts.accreditations).map((a) => ({
      id: a.id,
      quote: a.quote ?? a.id,
    })),
    ...(facts.foundedYear && facts.foundedYear.source === 'own_website'
      ? {
          foundedYear: {
            value: facts.foundedYear.value,
            quote: facts.foundedYear.quote ?? String(facts.foundedYear.value),
          },
        }
      : {}),
    claims: ownWebsite(facts.claims).map((f) => ({ value: f.value, quote: f.quote ?? f.value })),
    ...(facts.email?.source === 'own_website'
      ? { email: { value: facts.email.value, quote: facts.email.quote ?? facts.email.value } }
      : {}),
    ...(facts.phone?.source === 'own_website'
      ? { phone: { value: facts.phone.value, quote: facts.phone.quote ?? facts.phone.value } }
      : {}),
  })
}

/**
 * Deterministic stand-in: resolves the fixture whose scrapeMarkdown matches
 * the input (or a constructor-passed facts map keyed by businessName) and
 * returns its own_website-sourced facts. Zero token usage.
 */
export class FixtureFactsExtractor implements FactsExtractor {
  constructor(private readonly factsByBusinessName: Record<string, BusinessFacts> = {}) {}

  async extractFacts(input: ExtractFactsInput): Promise<{
    candidate: ExtractedFactsCandidate
    model: string
    usage: TokenUsage
  }> {
    const facts =
      this.factsByBusinessName[input.businessName] ??
      allProspectFixtures.find((f) => f.scrapeMarkdown === input.markdown)?.facts
    if (!facts) {
      throw new Error(`No fixture facts for business: ${input.businessName}`)
    }
    return {
      candidate: toExtractedCandidate(facts),
      model: 'fixture-extractor-v1',
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }
}
