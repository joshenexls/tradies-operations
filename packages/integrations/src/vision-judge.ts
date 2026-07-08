import { z } from 'zod'
import type { CostRecorder, FetchLike } from './types'

/**
 * Screenshot quality judge for the bad_site triage step: given a screenshot
 * of a prospect's existing website, score how dated/broken it looks. The
 * verdict feeds segmentation only — it is never shown on a generated site.
 */

export type VisionVerdict = {
  /** 0-100; below ~40 reads as clearly dated or broken. */
  score: number
  issues: string[]
}

export interface VisionJudge {
  judge(input: {
    imageBase64: string
    mediaType: 'image/png' | 'image/jpeg'
    context?: string
  }): Promise<VisionVerdict>
}

function fnv1a(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Deterministic stand-in: hashes the payload size + context into a stable
 * score in 25-90 — enough signal shape for pipeline tests, no model calls.
 */
export class FixtureVisionJudge implements VisionJudge {
  async judge(input: {
    imageBase64: string
    mediaType: 'image/png' | 'image/jpeg'
    context?: string
  }): Promise<VisionVerdict> {
    const hash = fnv1a(`${input.imageBase64.length}|${input.context ?? ''}`)
    const score = 25 + (hash % 66)
    return { score, issues: score > 60 ? [] : ['dated layout'] }
  }
}

export const EMIT_VERDICT_TOOL = 'emit_verdict'

export const visionVerdictSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z.array(z.string()).max(5).default([]),
})

/**
 * Minimal structural slice of the Anthropic Messages API. This package has no
 * @anthropic-ai/sdk dependency, so the surface is declared locally: tests
 * inject a stub client (mirroring @tradies/llm's AnthropicSiteSpecGenerator
 * pattern) and production falls back to a native-fetch implementation.
 */
export type VisionContentBlockParam =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

export type VisionMessageCreateParams = {
  model: string
  max_tokens: number
  system: string
  messages: { role: 'user'; content: VisionContentBlockParam[] }[]
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[]
  tool_choice: { type: 'tool'; name: string }
}

export type VisionResponseBlock =
  { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'text'; text: string }

export type VisionMessageResponse = {
  model: string
  content: VisionResponseBlock[]
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

export interface VisionMessagesClient {
  messages: {
    create(params: VisionMessageCreateParams): Promise<VisionMessageResponse>
  }
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

class FetchVisionMessagesClient implements VisionMessagesClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  readonly messages = {
    create: async (params: VisionMessageCreateParams): Promise<VisionMessageResponse> => {
      const response = await this.fetchImpl(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(params),
      })
      if (!response.ok) {
        throw new Error(`Anthropic messages request failed (HTTP ${response.status})`)
      }
      return (await response.json()) as VisionMessageResponse
    },
  }
}

const VISION_JUDGE_SYSTEM = [
  'You judge small-business website screenshots for visual quality.',
  'Score 0-100 where <40 = clearly dated or broken, 40-70 = usable but tired, >70 = modern and professional.',
  'Consider layout, typography, imagery, mobile-readiness cues and obvious rendering breakage.',
  `List at most 5 short, concrete issues. Respond only by calling the ${EMIT_VERDICT_TOOL} tool exactly once.`,
].join('\n')

export type HaikuVisionJudgeOptions = {
  apiKey?: string
  /** Defaults to claude-haiku-4-5 — cheap enough to run per screenshot. */
  model?: string
  /** Injectable stub for tests, like AnthropicSiteSpecGenerator. */
  client?: VisionMessagesClient
  costRecorder?: CostRecorder
  /** MicroGBP per million input tokens; default 0 (not billed to the ledger). */
  inputMicroGbpPerMTok?: number
  /** MicroGBP per million output tokens; default 0. */
  outputMicroGbpPerMTok?: number
  fetchImpl?: FetchLike
}

export class HaikuVisionJudge implements VisionJudge {
  private readonly client: VisionMessagesClient
  private readonly model: string

  constructor(private readonly options: HaikuVisionJudgeOptions = {}) {
    this.model = options.model ?? 'claude-haiku-4-5'
    if (options.client) {
      this.client = options.client
    } else if (options.apiKey) {
      this.client = new FetchVisionMessagesClient(options.apiKey, options.fetchImpl ?? fetch)
    } else {
      throw new Error('HaikuVisionJudge requires an apiKey or an injected client')
    }
  }

  async judge(input: {
    imageBase64: string
    mediaType: 'image/png' | 'image/jpeg'
    context?: string
  }): Promise<VisionVerdict> {
    const instruction = input.context
      ? `Context: ${input.context}\n\nJudge this website screenshot now.`
      : 'Judge this website screenshot now.'
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1_000,
      system: VISION_JUDGE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: input.mediaType, data: input.imageBase64 },
            },
            { type: 'text', text: instruction },
          ],
        },
      ],
      tools: [
        {
          name: EMIT_VERDICT_TOOL,
          description: 'Emit the screenshot quality verdict as structured JSON. Call exactly once.',
          input_schema: z.toJSONSchema(visionVerdictSchema) as Record<string, unknown>,
        },
      ],
      tool_choice: { type: 'tool', name: EMIT_VERDICT_TOOL },
    })

    const toolUse = response.content.find(
      (block): block is Extract<VisionResponseBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `Expected an ${EMIT_VERDICT_TOOL} tool_use block, got none (stop_reason: ${response.stop_reason})`,
      )
    }
    const verdict = visionVerdictSchema.parse(toolUse.input)

    const inputRate = this.options.inputMicroGbpPerMTok ?? 0
    const outputRate = this.options.outputMicroGbpPerMTok ?? 0
    this.options.costRecorder?.({
      category: 'llm',
      provider: 'anthropic',
      units: 1,
      amountMicroGbp: Math.round(
        (response.usage.input_tokens * inputRate + response.usage.output_tokens * outputRate) /
          1_000_000,
      ),
      ref: this.model,
    })

    return { score: verdict.score, issues: verdict.issues }
  }
}
