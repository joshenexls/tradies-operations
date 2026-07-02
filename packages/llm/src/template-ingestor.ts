import Anthropic from '@anthropic-ai/sdk'
import { allDesignTemplateFixtures } from '@tradies/fixtures'
import { slotKindSchema } from '@tradies/site-spec'
import { z } from 'zod'
import type { AnthropicMessagesClient } from './anthropic-generator'
import type { TokenUsage } from './generator'
import { buildAnnotateTemplatePrompt } from './prompts/annotate-template-v1'

/**
 * Template ingest: turn an uploaded HTML design system into annotation ops.
 * The candidate is raw LLM output — the ops-app action validates it with
 * @tradies/html-templates' annotationOpSchema and applies it to the DOM. The
 * op schema below is a deliberate structural twin of that schema (defined
 * inline to avoid a cross-package dependency race), used only to build the
 * forced tool's input_schema.
 */

export type TemplateIngestInput = {
  html: string
  hints: { name: string }
  /** Repair feedback from a previous attempt (see resolveIngestRepairFeedback). */
  feedback?: string
}

export type TemplateIngestResult = {
  /** Raw `{ ops: [...] }` candidate — callers must validate before applying. */
  candidate: unknown
  model: string
  usage: TokenUsage
}

export interface TemplateIngestor {
  annotate(input: TemplateIngestInput): Promise<TemplateIngestResult>
}

const selector = z.string().min(1).max(400)
const opId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .min(2)
  .max(48)

const itemSlotSchema = z.object({ selector, id: opId, kind: slotKindSchema })

/** Structural twin of html-templates' annotationOpSchema — do not export downstream. */
export const ingestOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('slot'), selector, id: opId, kind: slotKindSchema }),
  z.object({
    op: z.literal('repeat'),
    selector,
    id: opId,
    itemSelector: selector,
    minItems: z.number().int().min(1),
    maxItems: z.number().int().min(1).max(12),
    itemSlots: z.array(itemSlotSchema).min(1),
    itemImages: z.array(z.object({ selector, id: opId })).default([]),
  }),
  z.object({ op: z.literal('image'), selector, id: opId }),
  z.object({
    op: z.literal('strip'),
    selector,
    id: opId,
    reason: z.enum(['testimonials', 'reviews', 'other']),
  }),
  z.object({ op: z.literal('form'), selector }),
  z.object({ op: z.literal('phone-link'), selector }),
  z.object({ op: z.literal('map'), selector }),
  z.object({ op: z.literal('reviews-link'), selector }),
])

export const ingestOpsSchema = z.object({ ops: z.array(ingestOpSchema) })

export const EMIT_ANNOTATIONS_TOOL = 'emit_annotations'

export type AnthropicTemplateIngestorOptions = {
  apiKey?: string
  model?: string
  client?: AnthropicMessagesClient
}

/**
 * Structured annotation via forced tool use, mirroring AnthropicSiteSpecGenerator:
 * a single emit_annotations tool whose input_schema is the inline op-union
 * schema, with tool_choice pinned to it.
 */
export class AnthropicTemplateIngestor implements TemplateIngestor {
  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(options: AnthropicTemplateIngestorOptions = {}) {
    this.model = options.model ?? 'claude-sonnet-5'
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async annotate(input: TemplateIngestInput): Promise<TemplateIngestResult> {
    const prompt = buildAnnotateTemplatePrompt(input)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      tools: [
        {
          name: EMIT_ANNOTATIONS_TOOL,
          description:
            'Emit the annotation ops for the template as structured JSON matching the schema. Call exactly once.',
          input_schema: z.toJSONSchema(ingestOpsSchema) as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: EMIT_ANNOTATIONS_TOOL },
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `Expected an ${EMIT_ANNOTATIONS_TOOL} tool_use block, got none (stop_reason: ${response.stop_reason})`,
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
 * Compose retry feedback for a failed ingest attempt: ops whose selectors
 * matched nothing (returned by the annotation engine) plus schema/validation
 * problems, in a shape buildAnnotateTemplatePrompt appends to the retry.
 */
export function resolveIngestRepairFeedback(unmatched: object[], problems: string[]): string {
  const lines: string[] = []
  if (unmatched.length > 0) {
    lines.push('These ops did not match any element — fix or drop their selectors:')
    for (const op of unmatched) lines.push(`- ${JSON.stringify(op)}`)
  }
  if (problems.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('Validation problems:')
    for (const problem of problems) lines.push(`- ${problem}`)
  }
  return lines.join('\n')
}

/**
 * Deterministic stand-in: resolves the design-template fixture whose html
 * matches the input (or a constructor-passed candidate map keyed by template
 * name) and returns its hand-written annotations. Zero token usage.
 */
export class FixtureTemplateIngestor implements TemplateIngestor {
  constructor(private readonly candidatesByName: Record<string, { ops: object[] }> = {}) {}

  async annotate(input: TemplateIngestInput): Promise<TemplateIngestResult> {
    const candidate =
      this.candidatesByName[input.hints.name] ??
      (() => {
        const fixture = allDesignTemplateFixtures.find((f) => f.html === input.html)
        return fixture ? { ops: fixture.annotations } : undefined
      })()
    if (!candidate) {
      throw new Error(`No fixture annotations for template: ${input.hints.name}`)
    }
    return {
      candidate,
      model: 'fixture-ingestor-v1',
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }
}
