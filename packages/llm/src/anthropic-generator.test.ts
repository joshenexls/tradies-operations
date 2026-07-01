import type Anthropic from '@anthropic-ai/sdk'
import { getFixture } from '@tradies/fixtures'
import { stylePresetSchema } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import type { AnthropicMessagesClient } from './anthropic-generator'
import { AnthropicSiteSpecGenerator, EMIT_SITE_SPEC_TOOL } from './anthropic-generator'

const preset = stylePresetSchema.parse({
  styleKey: 'modern',
  name: 'Modern',
  trade: null,
  templateId: 'trade-modern',
  paletteId: 'navy-brass',
  fontPairId: 'archivo-inter',
  variantWeights: { hero: { split: 1 } },
  imageryPool: 'general-modern',
  tone: 'professional',
})

const facts = getFixture('leeds-plumber-swift').facts

function makeStub(content: Anthropic.Message['content']) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  const response = {
    id: 'msg_fixture',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    content,
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 2345, output_tokens: 678 },
  } as unknown as Anthropic.Message
  const client: AnthropicMessagesClient = {
    messages: {
      create: (params) => {
        calls.push(params)
        return Promise.resolve(response)
      },
    },
  }
  return { client, calls }
}

const toolUseContent = [
  { type: 'tool_use', id: 'toolu_1', name: EMIT_SITE_SPEC_TOOL, input: { specVersion: 1 } },
] as unknown as Anthropic.Message['content']

describe('AnthropicSiteSpecGenerator', () => {
  it('forces structured output through the emit_site_spec tool', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicSiteSpecGenerator({ client })
    await generator.generateSiteSpec({ facts, preset })

    expect(calls).toHaveLength(1)
    const params = calls[0]
    expect(params?.model).toBe('claude-sonnet-5')
    expect(params?.max_tokens).toBeGreaterThanOrEqual(8000)
    expect(params?.tool_choice).toEqual({ type: 'tool', name: EMIT_SITE_SPEC_TOOL })
    expect(params?.tools).toHaveLength(1)
    const tool = params?.tools?.[0] as Anthropic.Tool
    expect(tool.name).toBe(EMIT_SITE_SPEC_TOOL)
    expect(tool.input_schema.type).toBe('object')
    const properties = tool.input_schema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'specVersion',
        'templateId',
        'identity',
        'theme',
        'sections',
        'seo',
        'facts',
      ]),
    )
  })

  it('sends the site-spec-v1 prompt with facts, constraints and feedback', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicSiteSpecGenerator({ client })
    await generator.generateSiteSpec({ facts, preset, feedback: 'shorter headline' })

    const params = calls[0]
    expect(params?.system).toContain('professional')
    expect(params?.system).toContain('trade-modern')
    expect(params?.messages).toHaveLength(1)
    expect(params?.messages[0]?.role).toBe('user')
    const userText = params?.messages[0]?.content
    expect(userText).toContain('Swift Flow Plumbing')
    expect(userText).toContain('shorter headline')
  })

  it('extracts the tool_use input as the candidate and maps usage', async () => {
    const { client } = makeStub(toolUseContent)
    const generator = new AnthropicSiteSpecGenerator({ client })
    const result = await generator.generateSiteSpec({ facts, preset })

    expect(result.candidate).toEqual({ specVersion: 1 })
    expect(result.model).toBe('claude-sonnet-5')
    expect(result.usage).toEqual({ inputTokens: 2345, outputTokens: 678 })
  })

  it('respects a model override', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicSiteSpecGenerator({ client, model: 'claude-opus-4-8' })
    await generator.generateSiteSpec({ facts, preset })
    expect(calls[0]?.model).toBe('claude-opus-4-8')
  })

  it('throws when the response has no tool_use block', async () => {
    const textOnly = [
      { type: 'text', text: 'cannot comply' },
    ] as unknown as Anthropic.Message['content']
    const { client } = makeStub(textOnly)
    const generator = new AnthropicSiteSpecGenerator({ client })
    await expect(generator.generateSiteSpec({ facts, preset })).rejects.toThrow(/tool_use/)
  })
})
