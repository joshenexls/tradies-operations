import type Anthropic from '@anthropic-ai/sdk'
import { allProspectFixtures, getFixture } from '@tradies/fixtures'
import { validateStringsAgainstFacts } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import type { AnthropicMessagesClient } from './anthropic-generator'
import {
  AnthropicPitchGenerator,
  EMIT_PITCH_TOOL,
  FixturePitchGenerator,
  pitchSchema,
} from './pitch-generator'

const NOW = new Date('2026-07-01')
const PREVIEW_URL = 'https://preview.tradies.example/p/abc123'

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
    usage: { input_tokens: 900, output_tokens: 120 },
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
  { type: 'tool_use', id: 'toolu_1', name: EMIT_PITCH_TOOL, input: { subject: 's', body: 'b' } },
] as unknown as Anthropic.Message['content']

describe('pitchSchema', () => {
  it('rejects subjects over 80 characters', () => {
    expect(pitchSchema.safeParse({ subject: 'x'.repeat(81), body: 'w '.repeat(60) }).success).toBe(
      false,
    )
  })

  it('enforces the 55-130 word body window', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
    expect(pitchSchema.safeParse({ subject: 'ok', body: words(54) }).success).toBe(false)
    expect(pitchSchema.safeParse({ subject: 'ok', body: words(55) }).success).toBe(true)
    expect(pitchSchema.safeParse({ subject: 'ok', body: words(130) }).success).toBe(true)
    expect(pitchSchema.safeParse({ subject: 'ok', body: words(131) }).success).toBe(false)
  })
})

describe('AnthropicPitchGenerator', () => {
  it('forces structured output through the emit_pitch tool', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicPitchGenerator({ client })
    await generator.generatePitch({ facts, previewUrl: PREVIEW_URL })

    const params = calls[0]
    expect(params?.model).toBe('claude-sonnet-5')
    expect(params?.tool_choice).toEqual({ type: 'tool', name: EMIT_PITCH_TOOL })
    const tool = params?.tools?.[0] as Anthropic.Tool
    expect(tool.name).toBe(EMIT_PITCH_TOOL)
    expect(Object.keys(tool.input_schema.properties as Record<string, unknown>)).toEqual([
      'subject',
      'body',
    ])
  })

  it('sends the pitch-v1 prompt: rules, preview link, facts and feedback', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicPitchGenerator({ client })
    await generator.generatePitch({ facts, previewUrl: PREVIEW_URL, feedback: 'warmer opener' })

    const params = calls[0]
    expect(params?.system).toContain(PREVIEW_URL)
    expect(params?.system).toContain('{operator_name}')
    expect(params?.system).toContain('NO price claims')
    expect(params?.system).toContain('"Re:"')
    const userText = params?.messages[0]?.content
    expect(userText).toContain('Swift Flow Plumbing')
    expect(userText).toContain(PREVIEW_URL)
    expect(userText).toContain('warmer opener')
  })

  it('extracts the tool_use input as the candidate and maps usage', async () => {
    const { client } = makeStub(toolUseContent)
    const generator = new AnthropicPitchGenerator({ client })
    const result = await generator.generatePitch({ facts, previewUrl: PREVIEW_URL })
    expect(result.candidate).toEqual({ subject: 's', body: 'b' })
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 120 })
  })

  it('throws when the response has no tool_use block', async () => {
    const { client } = makeStub([
      { type: 'text', text: 'no' },
    ] as unknown as Anthropic.Message['content'])
    const generator = new AnthropicPitchGenerator({ client })
    await expect(generator.generatePitch({ facts, previewUrl: PREVIEW_URL })).rejects.toThrow(
      /tool_use/,
    )
  })
})

describe('FixturePitchGenerator', () => {
  const generator = new FixturePitchGenerator()

  for (const fixture of allProspectFixtures) {
    it(`produces a valid, grounded pitch for ${fixture.key}`, async () => {
      const result = await generator.generatePitch({
        facts: fixture.facts,
        previewUrl: PREVIEW_URL,
      })

      const parsed = pitchSchema.safeParse(result.candidate)
      expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(true)
      if (!parsed.success) return

      expect(parsed.data.body).toContain(PREVIEW_URL)
      expect(parsed.data.body).toContain(fixture.facts.businessName)
      expect(parsed.data.body).toContain('{operator_name}')
      expect(parsed.data.subject.startsWith('Re:')).toBe(false)

      const violations = validateStringsAgainstFacts(
        [
          { path: 'subject', text: parsed.data.subject },
          { path: 'body', text: parsed.data.body },
        ],
        fixture.facts,
        { now: NOW },
      )
      expect(violations).toEqual([])
    })
  }

  it('is deterministic', async () => {
    const first = await generator.generatePitch({ facts, previewUrl: PREVIEW_URL })
    const second = await generator.generatePitch({ facts, previewUrl: PREVIEW_URL })
    expect(second).toEqual(first)
  })
})
