import Anthropic from '@anthropic-ai/sdk'
import type {
  BusinessFacts,
  ContentDoc,
  ImageRef,
  RepeatGroup,
  SlotManifest,
} from '@tradies/site-spec'
import { TRADE_LABELS, contentDocSchemaFor } from '@tradies/site-spec'
import { z } from 'zod'
import type { AnthropicMessagesClient } from './anthropic-generator'
import {
  ABOUT_CLOSERS,
  ABOUT_OPENERS,
  CONTACT_HEADINGS,
  CTA_LABELS,
  FAQ_ITEMS,
  HEADLINES,
  SERVICE_DESCRIPTIONS,
  SUBHEADLINE_TAILS,
  TRADE_NOUNS,
  hashSeed,
  mulberry32,
  pick,
  serviceTitles,
  type Slots,
  type Tone,
} from './fixture-copy'
import type { GenerationResult } from './generator'
import { buildContentDocPrompt } from './prompts/content-doc-v1'

/**
 * Content-doc generation for html-kind design systems: pure content keyed by
 * the template's slot manifest. The tool input_schema is BUILT FROM the
 * manifest (contentDocSchemaFor), so length/count constraints are enforced at
 * emission; FACT-GUARD (validateContentDocAgainstFacts) runs on every
 * candidate after parse.
 */

export type ContentDocGenerationInput = {
  facts: BusinessFacts
  manifest: SlotManifest
  imageryPool: string
  tone: string
  /** Existing template copy per slot id (item slots may be keyed "group.slot"). */
  sampleTexts: Record<string, string>
  feedback?: string
}

export interface ContentDocGenerator {
  generateContentDoc(input: ContentDocGenerationInput): Promise<GenerationResult>
}

export const EMIT_CONTENT_DOC_TOOL = 'emit_content_doc'

export type AnthropicContentDocGeneratorOptions = {
  apiKey?: string
  model?: string
  client?: AnthropicMessagesClient
}

/**
 * Structured output via forced tool use, mirroring AnthropicSiteSpecGenerator:
 * a single emit_content_doc tool whose input_schema is the manifest-derived
 * zod schema, with tool_choice pinned to it.
 */
export class AnthropicContentDocGenerator implements ContentDocGenerator {
  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(options: AnthropicContentDocGeneratorOptions = {}) {
    this.model = options.model ?? 'claude-sonnet-5'
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async generateContentDoc(input: ContentDocGenerationInput): Promise<GenerationResult> {
    const prompt = buildContentDocPrompt(input)
    const schema = contentDocSchemaFor(input.manifest, { imageryPool: input.imageryPool })

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      tools: [
        {
          name: EMIT_CONTENT_DOC_TOOL,
          description:
            'Emit the complete content document as structured JSON matching the schema. Call exactly once.',
          input_schema: z.toJSONSchema(schema) as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: EMIT_CONTENT_DOC_TOOL },
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `Expected an ${EMIT_CONTENT_DOC_TOOL} tool_use block, got none (stop_reason: ${response.stop_reason})`,
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

const TONES: readonly Tone[] = ['friendly', 'professional', 'premium', 'no-nonsense']

const clampCount = (desired: number, min: number, max: number) =>
  Math.min(Math.max(desired, min), max)

/** Fit copy into a slot's [min, max] window without inventing new claims. */
function fit(text: string, min: number, max: number): string {
  const floor = Math.min(min, max)
  let out = text.trim()
  if (out.length > max) {
    const cut = out.slice(0, max + 1)
    const lastSpace = cut.lastIndexOf(' ')
    out = (lastSpace > 0 ? cut.slice(0, lastSpace) : out.slice(0, max)).replace(
      /[\s,;:.—–-]+$/u,
      '',
    )
    if (out.length === 0) out = text.slice(0, max)
  }
  while (out.length < floor) {
    out = `${out} We're here to help.`.trim()
    if (out.length > max) out = out.slice(0, max)
  }
  return out
}

/**
 * Deterministic stand-in for the real content-doc generator: same input →
 * byte-identical candidate (seeded PRNG over businessName + manifest slot
 * ids). Every slot is filled within its min/max from facts-grounded copy, so
 * candidates pass contentDocSchemaFor AND validateContentDocAgainstFacts by
 * construction.
 */
export class FixtureContentDocGenerator implements ContentDocGenerator {
  async generateContentDoc(input: ContentDocGenerationInput): Promise<GenerationResult> {
    const candidate = buildFixtureContentDoc(input)
    return {
      candidate,
      model: 'fixture-content-doc-v1',
      usage: {
        inputTokens: Math.ceil(JSON.stringify(input.facts).length / 4),
        outputTokens: Math.ceil(JSON.stringify(candidate).length / 4),
      },
    }
  }
}

export function buildFixtureContentDoc(input: ContentDocGenerationInput): ContentDoc {
  const { facts, manifest, imageryPool } = input
  const tone: Tone = TONES.includes(input.tone as Tone) ? (input.tone as Tone) : 'professional'
  const rng = mulberry32(
    hashSeed(`${facts.businessName}|${manifest.slots.map((s) => s.id).join(',')}`),
  )
  const slots: Slots = {
    name: facts.businessName,
    town: facts.town,
    label: TRADE_LABELS[facts.trade],
    noun: TRADE_NOUNS[facts.trade],
  }
  const areas = [...new Set([facts.town, ...facts.serviceAreas])]
  const titles = serviceTitles(facts)

  const aboutSentences = [ABOUT_OPENERS[tone](slots)]
  if (facts.foundedYear) {
    aboutSentences.push(
      `Established ${facts.foundedYear.value}, and still proud of every job that carries the name.`,
    )
  }
  if (facts.claims.length > 0) {
    aboutSentences.push(`${facts.claims.map((c) => c.value).join('. ')}.`)
  }
  const paragraphPool = [aboutSentences.join(' '), ABOUT_CLOSERS[tone]]
  const headingPool = [CONTACT_HEADINGS[tone], 'What we do', 'Areas we cover', 'How we work']

  // areas may all be longer than a tight slot; prefer one that fits verbatim
  const areaFor = (index: number, maxLength: number): string => {
    const preferred = areas[index % areas.length] ?? facts.town
    if (preferred.length <= maxLength) return preferred
    return areas.find((a) => a.length <= maxLength) ?? preferred.slice(0, maxLength)
  }

  const counters = { paragraph: 0, heading: 0, area: 0 }
  const fillSlot = (kind: string, minLength: number, maxLength: number): string => {
    switch (kind) {
      case 'headline': {
        const long = pick(rng, HEADLINES[tone])(slots)
        const short = `${slots.noun.charAt(0).toUpperCase()}${slots.noun.slice(1)} in ${facts.town}`
        return fit(long.length <= maxLength ? long : short, minLength, maxLength)
      }
      case 'subheadline':
        return fit(
          `From ${(titles[0] ?? 'repairs').toLowerCase()} to ${(titles[1] ?? 'maintenance').toLowerCase()}, ${SUBHEADLINE_TAILS[tone](facts.town)}`,
          minLength,
          maxLength,
        )
      case 'paragraph': {
        const text = paragraphPool[counters.paragraph % paragraphPool.length] ?? ''
        counters.paragraph += 1
        return fit(text, minLength, maxLength)
      }
      case 'short-label': {
        const text = headingPool[counters.heading % headingPool.length] ?? ''
        counters.heading += 1
        return fit(text, minLength, maxLength)
      }
      case 'cta-label':
        return fit(CTA_LABELS[tone], minLength, maxLength)
      case 'business-name':
        return facts.businessName
      case 'phone':
        // never invent digits: fall back to the business name when unevidenced
        return fit(facts.phone?.value ?? facts.businessName, minLength, maxLength)
      case 'email':
        return fit(facts.email?.value ?? facts.businessName, minLength, maxLength)
      case 'area': {
        const area = areaFor(counters.area, maxLength)
        counters.area += 1
        return area
      }
      case 'seo-title': {
        const long = `${facts.businessName} — ${slots.label} in ${facts.town}`
        const short = `${facts.businessName} — ${facts.town}`
        return fit(long.length <= maxLength ? long : short, minLength, maxLength)
      }
      case 'seo-description':
        return fit(
          `Local ${slots.label.toLowerCase()} services in ${facts.town} from ${facts.businessName}. Send a few details and get a clear, honest quote.`,
          minLength,
          maxLength,
        )
      case 'img-alt':
        return fit(`${slots.label} work in ${facts.town}`, minLength, maxLength)
      default:
        return fit(`${slots.label} in ${facts.town}`, minLength, maxLength)
    }
  }

  const doc: ContentDoc = { slots: {}, repeats: {}, images: {}, repeatImages: {} }

  for (const slot of manifest.slots) {
    doc.slots[slot.id] = fillSlot(slot.kind, slot.minLength, slot.maxLength)
  }

  for (const group of manifest.repeats) {
    doc.repeats[group.id] = buildRepeatItems(group)
  }

  for (const image of manifest.images) {
    doc.images[image.id] = imageRef(`${slots.label} work in ${facts.town}`)
  }

  for (const group of manifest.repeats) {
    if (group.itemImages.length === 0) continue
    const items = doc.repeats[group.id] ?? []
    doc.repeatImages[group.id] = items.map((_, i) =>
      imageRef(`${titles[i % titles.length] ?? slots.label} by ${facts.businessName}`),
    )
  }

  return doc

  function imageRef(alt: string): ImageRef {
    return { pool: imageryPool, index: Math.floor(rng() * 6), alt: alt.slice(0, 160) }
  }

  function buildRepeatItems(group: RepeatGroup): Record<string, string>[] {
    const isAreaGroup = group.itemSlots.every((s) => s.kind === 'area')
    const isFaqGroup = /faq|question/.test(
      `${group.id} ${group.itemSlots.map((s) => s.id).join(' ')}`,
    )
    const count = isAreaGroup
      ? clampCount(areas.length, group.minItems, group.maxItems)
      : isFaqGroup
        ? clampCount(FAQ_ITEMS.length, group.minItems, group.maxItems)
        : clampCount(titles.length, group.minItems, group.maxItems)

    const descriptions = SERVICE_DESCRIPTIONS[tone]
    return Array.from({ length: count }, (_, i) => {
      const item: Record<string, string> = {}
      for (const slot of group.itemSlots) {
        if (slot.kind === 'area') {
          item[slot.id] = areaFor(i, slot.maxLength)
        } else if (isFaqGroup) {
          const faq = FAQ_ITEMS[i % FAQ_ITEMS.length]
          if (!faq) continue
          item[slot.id] = fit(
            slot.kind === 'paragraph' ? faq.answer(facts.town) : faq.question,
            slot.minLength,
            slot.maxLength,
          )
        } else {
          const title = titles[i % titles.length] ?? 'General repairs'
          const describe = descriptions[i % descriptions.length]
          item[slot.id] = fit(
            slot.kind === 'paragraph'
              ? (describe?.(title) ?? `${title} handled with care from start to finish.`)
              : title,
            slot.minLength,
            slot.maxLength,
          )
        }
      }
      return item
    })
  }
}
