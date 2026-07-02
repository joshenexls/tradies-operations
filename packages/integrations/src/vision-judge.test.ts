import { describe, expect, it } from 'vitest'
import type { CostEntry } from './types'
import type {
  VisionMessageCreateParams,
  VisionMessageResponse,
  VisionMessagesClient,
} from './vision-judge'
import { EMIT_VERDICT_TOOL, FixtureVisionJudge, HaikuVisionJudge } from './vision-judge'

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'

describe('FixtureVisionJudge', () => {
  it('is deterministic for the same input', async () => {
    const judge = new FixtureVisionJudge()
    const a = await judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/png', context: 'x' })
    const b = await judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/png', context: 'x' })
    expect(a).toEqual(b)
  })

  it('keeps scores in the 25-90 band and derives issues from the score', async () => {
    const judge = new FixtureVisionJudge()
    const inputs = ['a', 'ab', 'abc', PNG_BASE64, PNG_BASE64 + PNG_BASE64]
    for (const [i, imageBase64] of inputs.entries()) {
      const verdict = await judge.judge({
        imageBase64,
        mediaType: 'image/png',
        context: `site-${i}`,
      })
      expect(verdict.score).toBeGreaterThanOrEqual(25)
      expect(verdict.score).toBeLessThanOrEqual(90)
      expect(verdict.issues).toEqual(verdict.score > 60 ? [] : ['dated layout'])
    }
  })

  it('varies with context', async () => {
    const judge = new FixtureVisionJudge()
    const scores = new Set<number>()
    for (let i = 0; i < 12; i++) {
      const verdict = await judge.judge({
        imageBase64: PNG_BASE64,
        mediaType: 'image/png',
        context: `ctx-${i}`,
      })
      scores.add(verdict.score)
    }
    expect(scores.size).toBeGreaterThan(1)
  })
})

function makeStub(content: VisionMessageResponse['content']) {
  const calls: VisionMessageCreateParams[] = []
  const response: VisionMessageResponse = {
    model: 'claude-haiku-4-5',
    content,
    stop_reason: 'tool_use',
    usage: { input_tokens: 2_000, output_tokens: 1_000 },
  }
  const client: VisionMessagesClient = {
    messages: {
      create: (params) => {
        calls.push(params)
        return Promise.resolve(response)
      },
    },
  }
  return { client, calls }
}

const verdictContent: VisionMessageResponse['content'] = [
  {
    type: 'tool_use',
    id: 'toolu_1',
    name: EMIT_VERDICT_TOOL,
    input: { score: 32, issues: ['tiny text', 'broken hero image'] },
  },
]

describe('HaikuVisionJudge', () => {
  it('sends the screenshot as an image block and forces the verdict tool', async () => {
    const { client, calls } = makeStub(verdictContent)
    const judge = new HaikuVisionJudge({ client })
    await judge.judge({
      imageBase64: PNG_BASE64,
      mediaType: 'image/png',
      context: 'Prospect: Swift Flow Plumbing, Leeds',
    })

    expect(calls).toHaveLength(1)
    const params = calls[0]
    expect(params?.model).toBe('claude-haiku-4-5')
    expect(params?.system).toContain('screenshot')
    expect(params?.system).toContain('0-100')
    expect(params?.tool_choice).toEqual({ type: 'tool', name: EMIT_VERDICT_TOOL })
    expect(params?.tools).toHaveLength(1)
    const tool = params?.tools[0]
    expect(tool?.name).toBe(EMIT_VERDICT_TOOL)
    expect(tool?.input_schema['type']).toBe('object')
    const properties = tool?.input_schema['properties'] as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(expect.arrayContaining(['score', 'issues']))

    const content = params?.messages[0]?.content ?? []
    const imageBlock = content.find((b) => b.type === 'image')
    expect(imageBlock).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: PNG_BASE64 },
    })
    const textBlock = content.find((b) => b.type === 'text')
    expect(textBlock?.type === 'text' && textBlock.text).toContain('Swift Flow Plumbing')
  })

  it('parses the tool_use input into a verdict', async () => {
    const { client } = makeStub(verdictContent)
    const judge = new HaikuVisionJudge({ client })
    const verdict = await judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/jpeg' })
    expect(verdict).toEqual({ score: 32, issues: ['tiny text', 'broken hero image'] })
  })

  it('respects a model override', async () => {
    const { client, calls } = makeStub(verdictContent)
    const judge = new HaikuVisionJudge({ client, model: 'claude-sonnet-5' })
    await judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/png' })
    expect(calls[0]?.model).toBe('claude-sonnet-5')
  })

  it('maps usage to cost via the constructor rates', async () => {
    const entries: CostEntry[] = []
    const { client } = makeStub(verdictContent)
    const judge = new HaikuVisionJudge({
      client,
      costRecorder: (e) => entries.push(e),
      inputMicroGbpPerMTok: 800_000,
      outputMicroGbpPerMTok: 4_000_000,
    })
    await judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/png' })
    // (2000 * 800000 + 1000 * 4000000) / 1e6 = 1600 + 4000 = 5600
    expect(entries).toEqual([
      {
        category: 'llm',
        provider: 'anthropic',
        units: 1,
        amountMicroGbp: 5_600,
        ref: 'claude-haiku-4-5',
      },
    ])
  })

  it('defaults the recorded cost to zero when no rates are configured', async () => {
    const entries: CostEntry[] = []
    const { client } = makeStub(verdictContent)
    const judge = new HaikuVisionJudge({ client, costRecorder: (e) => entries.push(e) })
    await judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/png' })
    expect(entries[0]?.amountMicroGbp).toBe(0)
  })

  it('throws when the response has no tool_use block', async () => {
    const { client } = makeStub([{ type: 'text', text: 'cannot comply' }])
    const judge = new HaikuVisionJudge({ client })
    await expect(judge.judge({ imageBase64: PNG_BASE64, mediaType: 'image/png' })).rejects.toThrow(
      /tool_use/,
    )
  })

  it('requires an apiKey or an injected client', () => {
    expect(() => new HaikuVisionJudge()).toThrow(/apiKey|client/)
  })
})
