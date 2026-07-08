import type Anthropic from '@anthropic-ai/sdk'
import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import type { AnthropicMessagesClient } from './anthropic-generator'
import { AnthropicChatResponder, CAPTURE_LEAD_TOOL, FixtureChatResponder } from './chat-responder'
import { CHAT_DEMO_PREAMBLE } from './prompts/chat-v1'

const swift = getFixture('leeds-plumber-swift')
const hallam = getFixture('sheffield-electrician-hallam')

function makeStub(content: Anthropic.Message['content']) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  const response = {
    id: 'msg_fixture',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 456, output_tokens: 78 },
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

const ask = (content: string) => [{ role: 'user' as const, content }]

describe('AnthropicChatResponder', () => {
  it('sends the chat-v1 system prompt with the facts sheet and an unforced capture_lead tool', async () => {
    const { client, calls } = makeStub([
      { type: 'text', text: 'Hello!' },
    ] as unknown as Anthropic.Message['content'])
    const responder = new AnthropicChatResponder({ client })
    await responder.respond({ facts: swift.facts, demo: true, messages: ask('hi') })

    const params = calls[0]
    expect(params?.model).toBe('claude-haiku-4-5')
    expect(params?.system).toContain('Swift Flow Plumbing')
    expect(params?.system).toContain('0113 496 0721')
    expect(params?.system).toContain(CHAT_DEMO_PREAMBLE)
    expect(params?.system).toContain('ONLY source of truth')
    // capture_lead present but never forced
    expect(params?.tools?.map((t) => t.name)).toEqual([CAPTURE_LEAD_TOOL])
    expect(params?.tool_choice).toBeUndefined()
    expect(params?.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('omits the demo preamble outside demo mode', async () => {
    const { client, calls } = makeStub([
      { type: 'text', text: 'Hello!' },
    ] as unknown as Anthropic.Message['content'])
    const responder = new AnthropicChatResponder({ client })
    await responder.respond({ facts: swift.facts, demo: false, messages: ask('hi') })
    expect(calls[0]?.system).not.toContain(CHAT_DEMO_PREAMBLE)
  })

  it('maps a text block to the reply', async () => {
    const { client } = makeStub([
      { type: 'text', text: 'Yes, we do boiler repairs.' },
    ] as unknown as Anthropic.Message['content'])
    const responder = new AnthropicChatResponder({ client })
    const result = await responder.respond({
      facts: swift.facts,
      demo: false,
      messages: ask('Do you fix boilers?'),
    })
    expect(result.reply).toBe('Yes, we do boiler repairs.')
    expect(result.lead).toBeUndefined()
    expect(result.model).toBe('claude-haiku-4-5')
    expect(result.usage).toEqual({ inputTokens: 456, outputTokens: 78 })
  })

  it('maps a capture_lead tool_use to the lead and synthesizes a confirmation when there is no text', async () => {
    const { client } = makeStub([
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: CAPTURE_LEAD_TOOL,
        input: { name: 'Dave', phone: '07700 900123' },
      },
    ] as unknown as Anthropic.Message['content'])
    const responder = new AnthropicChatResponder({ client })
    const result = await responder.respond({
      facts: swift.facts,
      demo: false,
      messages: ask("I'm Dave, call me on 07700 900123"),
    })
    expect(result.lead).toEqual({ name: 'Dave', phone: '07700 900123' })
    expect(result.reply).toContain('Swift Flow Plumbing')
    expect(result.reply).toMatch(/in touch/i)
  })
})

describe('FixtureChatResponder', () => {
  const responder = new FixtureChatResponder()
  const INVENTED = [
    'loft conversion',
    'solar panel',
    'pest control',
    'landscaping',
    'window cleaning',
  ]

  for (const fixture of [swift, hallam]) {
    describe(`grounded answers for ${fixture.key}`, () => {
      it('answers a service question from the facts sheet', async () => {
        const service = fixture.facts.services[0]!.value
        const result = await responder.respond({
          facts: fixture.facts,
          demo: false,
          messages: ask(`Do you do ${service.toLowerCase()}?`),
        })
        expect(result.reply.toLowerCase()).toContain(service.toLowerCase())
        expect(result.reply).toContain(fixture.facts.businessName)
        for (const invented of INVENTED) {
          expect(result.reply.toLowerCase()).not.toContain(invented)
        }
      })

      it('gives a grounded fallback for questions the facts cannot answer', async () => {
        const result = await responder.respond({
          facts: fixture.facts,
          demo: false,
          messages: ask('Do you install swimming pools?'),
        })
        expect(result.reply).toMatch(/not certain|not sure/i)
        expect(result.reply).toContain(fixture.facts.town)
        expect(result.reply).toMatch(/call you back/i)
        for (const invented of [...INVENTED, 'swimming pool']) {
          expect(result.reply.toLowerCase()).not.toContain(invented)
        }
        // never mentions services from OTHER businesses either
        const other = fixture === swift ? hallam : swift
        for (const service of other.facts.services) {
          expect(result.reply.toLowerCase()).not.toContain(service.value.toLowerCase())
        }
      })
    })
  }

  it('extracts a lead from a name + phone-shaped message and confirms', async () => {
    const result = await responder.respond({
      facts: swift.facts,
      demo: false,
      messages: ask("Hi, I'm Sarah Jones, can someone ring me on 07700 900456 about a leak?"),
    })
    expect(result.lead).toMatchObject({ name: 'Sarah Jones', phone: '07700 900456' })
    expect(result.lead?.message).toContain('leak')
    expect(result.reply).toContain('Sarah Jones')
    expect(result.reply).toContain('Swift Flow Plumbing')
    expect(result.reply).toMatch(/in touch/i)
  })

  it('extracts an email-shaped lead too', async () => {
    const result = await responder.respond({
      facts: swift.facts,
      demo: false,
      messages: ask('My name is Tom, email me at tom@example.com please'),
    })
    expect(result.lead).toMatchObject({ name: 'Tom', email: 'tom@example.com' })
  })

  it('prefixes the first demo reply with the demo preamble', async () => {
    const first = await responder.respond({
      facts: swift.facts,
      demo: true,
      messages: ask('Do you cover Headingley?'),
    })
    expect(first.reply.startsWith(CHAT_DEMO_PREAMBLE)).toBe(true)

    const later = await responder.respond({
      facts: swift.facts,
      demo: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: `${CHAT_DEMO_PREAMBLE} Hello!` },
        { role: 'user', content: 'Do you fix boilers?' },
      ],
    })
    expect(later.reply.startsWith(CHAT_DEMO_PREAMBLE)).toBe(false)

    const nonDemo = await responder.respond({
      facts: swift.facts,
      demo: false,
      messages: ask('hi'),
    })
    expect(nonDemo.reply).not.toContain(CHAT_DEMO_PREAMBLE)
  })

  it('is deterministic and reports the fixture model with zero usage', async () => {
    const input = { facts: swift.facts, demo: false, messages: ask('Do you do boiler repairs?') }
    const first = await responder.respond(input)
    const second = await responder.respond(input)
    expect(second).toEqual(first)
    expect(first.model).toBe('fixture-chat-v1')
    expect(first.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})
