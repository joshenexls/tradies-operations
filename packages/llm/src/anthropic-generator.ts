import Anthropic from '@anthropic-ai/sdk'
import { presetConstraints, siteSpecSchema } from '@tradies/site-spec'
import { z } from 'zod'
import type { GenerationInput, GenerationResult, SiteSpecGenerator } from './generator'
import { buildSiteSpecPrompt } from './prompts/site-spec-v1'

/** Minimal client surface so tests can inject a stub instead of hitting the network. */
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
  }
}

export type AnthropicSiteSpecGeneratorOptions = {
  apiKey?: string
  model?: string
  client?: AnthropicMessagesClient
}

export const EMIT_SITE_SPEC_TOOL = 'emit_site_spec'

/**
 * Structured output via forced tool use: a single emit_site_spec tool whose
 * input_schema is the zod SiteSpec schema, with tool_choice pinned to it —
 * the model can only answer by emitting a candidate spec.
 */
export class AnthropicSiteSpecGenerator implements SiteSpecGenerator {
  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(options: AnthropicSiteSpecGeneratorOptions = {}) {
    this.model = options.model ?? 'claude-sonnet-5'
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async generateSiteSpec(input: GenerationInput): Promise<GenerationResult> {
    const constraints = presetConstraints(input.preset)
    const prompt = buildSiteSpecPrompt({
      facts: input.facts,
      constraints,
      feedback: input.feedback,
    })

    const response = await this.client.messages.create({
      model: this.model,
      // a full spec with embedded facts is large; leave generous headroom
      max_tokens: 16000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      tools: [
        {
          name: EMIT_SITE_SPEC_TOOL,
          description:
            'Emit the complete website spec as structured JSON matching the schema. Call exactly once.',
          input_schema: z.toJSONSchema(siteSpecSchema) as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: EMIT_SITE_SPEC_TOOL },
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `Expected an ${EMIT_SITE_SPEC_TOOL} tool_use block, got none (stop_reason: ${response.stop_reason})`,
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
