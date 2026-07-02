import Anthropic from '@anthropic-ai/sdk'
import type { BusinessFacts } from '@tradies/site-spec'
import { TRADE_LABELS } from '@tradies/site-spec'
import { z } from 'zod'
import type { AnthropicMessagesClient } from './anthropic-generator'
import type { TokenUsage } from './generator'
import { buildPitchPrompt } from './prompts/pitch-v1'

/**
 * Outreach pitch generation. The candidate is raw tool output — callers must
 * run pitchSchema + validateStringsAgainstFacts (the pitch-side FACT-GUARD)
 * before sending. Legal footer/unsubscribe text is appended in code, never
 * written by the model.
 */

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

export const pitchSchema = z.object({
  subject: z.string().min(1).max(80),
  body: z
    .string()
    .min(1)
    .refine((body) => {
      const words = countWords(body)
      return words >= 55 && words <= 130
    }, 'body must be between 55 and 130 words'),
})
export type Pitch = z.infer<typeof pitchSchema>

export type PitchGenerationInput = {
  facts: BusinessFacts
  previewUrl: string
  feedback?: string
}

export type PitchGenerationResult = {
  /** Raw candidate — callers must run pitchSchema + FACT-GUARD before use. */
  candidate: unknown
  model: string
  usage: TokenUsage
}

export interface PitchGenerator {
  generatePitch(input: PitchGenerationInput): Promise<PitchGenerationResult>
}

export const EMIT_PITCH_TOOL = 'emit_pitch'

export type AnthropicPitchGeneratorOptions = {
  apiKey?: string
  model?: string
  client?: AnthropicMessagesClient
}

/**
 * Structured output via forced tool use, mirroring AnthropicSiteSpecGenerator:
 * a single emit_pitch tool whose input_schema is pitchSchema, with
 * tool_choice pinned to it.
 */
export class AnthropicPitchGenerator implements PitchGenerator {
  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(options: AnthropicPitchGeneratorOptions = {}) {
    this.model = options.model ?? 'claude-sonnet-5'
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async generatePitch(input: PitchGenerationInput): Promise<PitchGenerationResult> {
    const prompt = buildPitchPrompt(input)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      tools: [
        {
          name: EMIT_PITCH_TOOL,
          description:
            'Emit the pitch email as structured JSON matching the schema. Call exactly once.',
          input_schema: z.toJSONSchema(pitchSchema) as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: EMIT_PITCH_TOOL },
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `Expected an ${EMIT_PITCH_TOOL} tool_use block, got none (stop_reason: ${response.stop_reason})`,
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

/**
 * Deterministic stand-in: a fixed-scaffold pitch grounded in the facts sheet
 * (business name, town, an evidenced service when present) with the preview
 * link verbatim. Passes pitchSchema and validateStringsAgainstFacts by
 * construction.
 */
export class FixturePitchGenerator implements PitchGenerator {
  async generatePitch(input: PitchGenerationInput): Promise<PitchGenerationResult> {
    const candidate = buildFixturePitch(input)
    return {
      candidate,
      model: 'fixture-pitch-v1',
      usage: {
        inputTokens: Math.ceil(JSON.stringify(input.facts).length / 4),
        outputTokens: Math.ceil(JSON.stringify(candidate).length / 4),
      },
    }
  }
}

export function buildFixturePitch(input: PitchGenerationInput): Pitch {
  const { facts, previewUrl } = input
  const service = facts.services[0]?.value.toLowerCase() ?? TRADE_LABELS[facts.trade].toLowerCase()

  let subject = `A new website for ${facts.businessName}`
  if (subject.length > 80) subject = 'A new website for your business'

  const body = [
    `Hi there,`,
    ``,
    `I came across ${facts.businessName} while looking at ${facts.trade === 'other' ? 'trade' : TRADE_LABELS[facts.trade].toLowerCase()} businesses in ${facts.town}, and I put together a quick preview of what a new website could look like for you: ${previewUrl}`,
    ``,
    `It is built around what you already offer — things like ${service} — with a clear way for customers in ${facts.town} to call you or send an enquiry from any phone.`,
    ``,
    `If you like it, I can have it live on your own domain within days, and I am happy to change anything that does not feel right. If it is not for you, no problem at all — just say the word and I will take it down.`,
    ``,
    `{operator_name}`,
  ].join('\n')

  return { subject, body }
}
