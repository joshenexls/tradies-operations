import type Anthropic from '@anthropic-ai/sdk'
import { allDesignTemplateFixtures, getDesignTemplateFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import type { AnthropicMessagesClient } from './anthropic-generator'
import {
  AnthropicTemplateIngestor,
  EMIT_ANNOTATIONS_TOOL,
  FixtureTemplateIngestor,
  ingestOpsSchema,
  resolveIngestRepairFeedback,
} from './template-ingestor'

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
    usage: { input_tokens: 4321, output_tokens: 987 },
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
  { type: 'tool_use', id: 'toolu_1', name: EMIT_ANNOTATIONS_TOOL, input: { ops: [] } },
] as unknown as Anthropic.Message['content']

const lander = getDesignTemplateFixture('craftsman-dark')

describe('AnthropicTemplateIngestor', () => {
  it('forces structured output through the emit_annotations tool', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const ingestor = new AnthropicTemplateIngestor({ client })
    await ingestor.annotate({ html: lander.html, hints: { name: lander.name } })

    expect(calls).toHaveLength(1)
    const params = calls[0]
    expect(params?.model).toBe('claude-sonnet-5')
    expect(params?.tool_choice).toEqual({ type: 'tool', name: EMIT_ANNOTATIONS_TOOL })
    expect(params?.tools).toHaveLength(1)
    const tool = params?.tools?.[0] as Anthropic.Tool
    expect(tool.name).toBe(EMIT_ANNOTATIONS_TOOL)
    expect(tool.input_schema.type).toBe('object')
    expect(Object.keys(tool.input_schema.properties as Record<string, unknown>)).toEqual(['ops'])
  })

  it('sends the annotate-template-v1 prompt: strip rule, selector rules, html and name', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const ingestor = new AnthropicTemplateIngestor({ client })
    await ingestor.annotate({
      html: lander.html,
      hints: { name: lander.name },
      feedback: 'selector #nope matched nothing',
    })

    const params = calls[0]
    expect(params?.system).toContain('DMCC')
    expect(params?.system).toMatch(/testimonial/i)
    expect(params?.system).toContain(':nth-of-type')
    const userText = params?.messages[0]?.content
    expect(userText).toContain(lander.html.slice(0, 200))
    expect(userText).toContain('Craftsman Dark')
    expect(userText).toContain('selector #nope matched nothing')
  })

  it('extracts the tool_use input as the candidate and maps usage', async () => {
    const { client } = makeStub(toolUseContent)
    const ingestor = new AnthropicTemplateIngestor({ client })
    const result = await ingestor.annotate({ html: lander.html, hints: { name: lander.name } })
    expect(result.candidate).toEqual({ ops: [] })
    expect(result.model).toBe('claude-sonnet-5')
    expect(result.usage).toEqual({ inputTokens: 4321, outputTokens: 987 })
  })

  it('throws when the response has no tool_use block', async () => {
    const { client } = makeStub([
      { type: 'text', text: 'cannot comply' },
    ] as unknown as Anthropic.Message['content'])
    const ingestor = new AnthropicTemplateIngestor({ client })
    await expect(
      ingestor.annotate({ html: lander.html, hints: { name: lander.name } }),
    ).rejects.toThrow(/tool_use/)
  })
})

describe('ingestOpsSchema (inline structural twin)', () => {
  it('accepts every fixture annotation list', () => {
    for (const fixture of allDesignTemplateFixtures) {
      const parsed = ingestOpsSchema.safeParse({ ops: fixture.annotations })
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('rejects unknown ops and bad ids', () => {
    expect(ingestOpsSchema.safeParse({ ops: [{ op: 'explode', selector: 'x' }] }).success).toBe(
      false,
    )
    expect(
      ingestOpsSchema.safeParse({
        ops: [{ op: 'slot', selector: 'h1', id: 'Bad Id!', kind: 'headline' }],
      }).success,
    ).toBe(false)
  })
})

describe('FixtureTemplateIngestor', () => {
  it('resolves the fixture whose html matches and returns its annotations with zero usage', async () => {
    const ingestor = new FixtureTemplateIngestor()
    for (const fixture of allDesignTemplateFixtures) {
      const result = await ingestor.annotate({ html: fixture.html, hints: { name: fixture.name } })
      expect(result.candidate).toEqual({ ops: fixture.annotations })
      expect(result.model).toBe('fixture-ingestor-v1')
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    }
  })

  it('prefers a constructor-passed candidate map', async () => {
    const ops = [{ op: 'form', selector: '#f' }]
    const ingestor = new FixtureTemplateIngestor({ Custom: { ops } })
    const result = await ingestor.annotate({ html: '<html></html>', hints: { name: 'Custom' } })
    expect(result.candidate).toEqual({ ops })
  })

  it('throws for an unknown template', async () => {
    const ingestor = new FixtureTemplateIngestor()
    await expect(
      ingestor.annotate({ html: '<html></html>', hints: { name: 'Mystery' } }),
    ).rejects.toThrow(/No fixture annotations/)
  })
})

describe('resolveIngestRepairFeedback', () => {
  it('lists unmatched ops and problems', () => {
    const feedback = resolveIngestRepairFeedback(
      [{ op: 'slot', selector: '#missing', id: 'x-1', kind: 'headline' }],
      ['duplicate id: hero-headline'],
    )
    expect(feedback).toContain('#missing')
    expect(feedback).toContain('did not match any element')
    expect(feedback).toContain('duplicate id: hero-headline')
  })

  it('returns an empty string when there is nothing to repair', () => {
    expect(resolveIngestRepairFeedback([], [])).toBe('')
  })
})
