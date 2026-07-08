import Anthropic from '@anthropic-ai/sdk'
import type { BusinessFacts } from '@tradies/site-spec'
import { TRADE_LABELS } from '@tradies/site-spec'
import { z } from 'zod'
import type { AnthropicMessagesClient } from './anthropic-generator'
import type { TokenUsage } from './generator'
import { CHAT_DEMO_PREAMBLE, buildChatPrompt } from './prompts/chat-v1'

/**
 * The site chatbot: answers visitor questions ONLY from the facts sheet and
 * captures leads through an optional (never forced) capture_lead tool. The
 * grounding guarantee is the prompt plus the facts-only fixture eval — the
 * chatbot never writes anything persistent, so FACT-GUARD does not gate it.
 */

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type ChatLead = { name?: string; phone?: string; email?: string; message?: string }

export type ChatInput = {
  facts: BusinessFacts
  demo: boolean
  messages: ChatMessage[]
}

export type ChatResult = {
  reply: string
  lead?: ChatLead
  usage: TokenUsage
  model: string
}

export interface ChatResponder {
  respond(input: ChatInput): Promise<ChatResult>
}

export const CAPTURE_LEAD_TOOL = 'capture_lead'

export const captureLeadSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  message: z.string().optional(),
})

export type AnthropicChatResponderOptions = {
  apiKey?: string
  model?: string
  client?: AnthropicMessagesClient
}

export class AnthropicChatResponder implements ChatResponder {
  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(options: AnthropicChatResponderOptions = {}) {
    this.model = options.model ?? 'claude-haiku-4-5'
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async respond(input: ChatInput): Promise<ChatResult> {
    const prompt = buildChatPrompt({ facts: input.facts, demo: input.demo })

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1000,
      system: prompt.system,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      // optional tool — the model calls it when the visitor shares contact details
      tools: [
        {
          name: CAPTURE_LEAD_TOOL,
          description:
            'Record the visitor as a lead when they share contact details (name, phone or email). Include whatever they provided.',
          input_schema: z.toJSONSchema(captureLeadSchema) as Anthropic.Tool['input_schema'],
        },
      ],
    })

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === CAPTURE_LEAD_TOOL,
    )

    let lead: ChatLead | undefined
    if (toolUse) {
      const parsed = captureLeadSchema.safeParse(toolUse.input)
      lead = parsed.success ? parsed.data : {}
    }

    const reply =
      textBlock?.text.trim() ||
      `Thanks — I've passed your details to ${input.facts.businessName}. They'll be in touch soon.`

    return {
      reply,
      ...(lead ? { lead } : {}),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }
}

// UK phone shapes: 01xx/02x/03xx landlines, 07xxx mobiles, +44 forms
const PHONE_SHAPE = /(?:\+44\s?\d(?:[\s-]?\d){8,9}|0\d{2,4}(?:[\s-]?\d){6,8})/
const EMAIL_SHAPE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const NAME_SHAPE =
  /\b(?:my name(?:'s| is)|i am|i'm|this is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/i

/**
 * Deterministic keyword-driven stand-in: answers service questions from the
 * facts sheet, extracts leads from phone/email-shaped messages, and otherwise
 * gives a generic grounded answer that steers towards a callback. Zero usage.
 */
export class FixtureChatResponder implements ChatResponder {
  async respond(input: ChatInput): Promise<ChatResult> {
    const { facts, demo, messages } = input
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const isFirstReply = !messages.some((m) => m.role === 'assistant')
    const prefix = demo && isFirstReply ? `${CHAT_DEMO_PREAMBLE} ` : ''

    const base: Omit<ChatResult, 'reply'> = {
      model: 'fixture-chat-v1',
      usage: { inputTokens: 0, outputTokens: 0 },
    }

    if (!lastUser) {
      return {
        ...base,
        reply: `${prefix}Hello! I'm the assistant for ${facts.businessName} in ${facts.town}. How can I help?`,
      }
    }

    const text = lastUser.content
    const phone = text.match(PHONE_SHAPE)?.[0]
    const email = text.match(EMAIL_SHAPE)?.[0]
    const name = text.match(NAME_SHAPE)?.[1]

    if (phone || email) {
      const lead: ChatLead = {
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        message: text,
      }
      return {
        ...base,
        lead,
        reply: `${prefix}Thanks${name ? `, ${name}` : ''} — I've passed your details to ${facts.businessName}. They'll be in touch soon.`,
      }
    }

    const asked = facts.services.find((s) => text.toLowerCase().includes(s.value.toLowerCase()))
    if (asked) {
      return {
        ...base,
        reply: `${prefix}Yes — ${facts.businessName} offers ${asked.value.toLowerCase()} in and around ${facts.town}. Could I take your name and phone number so they can call you back with the details?`,
      }
    }

    return {
      ...base,
      reply: `${prefix}I'm not certain about that one, sorry — ${facts.businessName} is a ${TRADE_LABELS[facts.trade].toLowerCase()} business covering ${[...new Set([facts.town, ...facts.serviceAreas])].join(', ')}. If you leave your name and phone number, they'll call you back to talk it through.`,
    }
  }
}
