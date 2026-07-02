import type Anthropic from '@anthropic-ai/sdk'
import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import type { AnthropicMessagesClient } from './anthropic-generator'
import type { ExtractedFactsPatch } from './extractor'
import {
  AnthropicFactsExtractor,
  EMIT_FACTS_TOOL,
  extractedFactsSchema,
  FixtureFactsExtractor,
  toBusinessFactsPatch,
  verifyExtractedFacts,
} from './extractor'

const fixture = getFixture('leeds-plumber-swift')

const extractInput = {
  businessName: fixture.businessName,
  trade: fixture.trade,
  town: fixture.town,
  markdown: fixture.scrapeMarkdown as string,
}

function makeStub(content: Anthropic.Message['content']) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  const response = {
    id: 'msg_fixture',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content,
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 340 },
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
  { type: 'tool_use', id: 'toolu_1', name: EMIT_FACTS_TOOL, input: { services: [] } },
] as unknown as Anthropic.Message['content']

describe('AnthropicFactsExtractor', () => {
  it('forces structured output through the emit_facts tool', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const extractor = new AnthropicFactsExtractor({ client })
    await extractor.extractFacts(extractInput)

    expect(calls).toHaveLength(1)
    const params = calls[0]
    expect(params?.model).toBe('claude-haiku-4-5')
    expect(params?.tool_choice).toEqual({ type: 'tool', name: EMIT_FACTS_TOOL })
    expect(params?.tools).toHaveLength(1)
    const tool = params?.tools?.[0] as Anthropic.Tool
    expect(tool.name).toBe(EMIT_FACTS_TOOL)
    expect(tool.input_schema.type).toBe('object')
    const properties = tool.input_schema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'services',
        'serviceAreas',
        'accreditations',
        'foundedYear',
        'claims',
        'email',
        'phone',
      ]),
    )
  })

  it('sends the extract-facts-v1 prompt with the business context and markdown', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const extractor = new AnthropicFactsExtractor({ client })
    await extractor.extractFacts(extractInput)

    const params = calls[0]
    expect(params?.system).toContain('Swift Flow Plumbing')
    expect(params?.system).toContain('emit_facts')
    expect(params?.messages).toHaveLength(1)
    expect(params?.messages[0]?.role).toBe('user')
    expect(params?.messages[0]?.content).toContain('We repair and service all makes of boiler')
  })

  it('extracts the tool_use input as the candidate and maps usage', async () => {
    const { client } = makeStub(toolUseContent)
    const extractor = new AnthropicFactsExtractor({ client })
    const result = await extractor.extractFacts(extractInput)
    expect(result.candidate).toEqual({ services: [] })
    expect(result.model).toBe('claude-haiku-4-5')
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 340 })
  })

  it('respects a model override', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const extractor = new AnthropicFactsExtractor({ client, model: 'claude-sonnet-5' })
    await extractor.extractFacts(extractInput)
    expect(calls[0]?.model).toBe('claude-sonnet-5')
  })

  it('throws when the response has no tool_use block', async () => {
    const textOnly = [
      { type: 'text', text: 'cannot comply' },
    ] as unknown as Anthropic.Message['content']
    const { client } = makeStub(textOnly)
    const extractor = new AnthropicFactsExtractor({ client })
    await expect(extractor.extractFacts(extractInput)).rejects.toThrow(/tool_use/)
  })
})

describe('toBusinessFactsPatch', () => {
  it('stamps source own_website on every fact', () => {
    const parsed = extractedFactsSchema.parse({
      services: [{ value: 'Boiler repairs', quote: 'We repair and service all makes of boiler' }],
      serviceAreas: ['Leeds'],
      accreditations: [{ id: 'watersafe', quote: 'WaterSafe approved installer' }],
      foundedYear: { value: 2011, quote: 'serving Leeds since 2011' },
      claims: [{ value: 'Fully insured', quote: 'We are fully insured' }],
      email: { value: 'info@swiftflowplumbing.example', quote: 'info@swiftflowplumbing.example' },
      phone: { value: '0113 496 0721', quote: '0113 496 0721' },
    })
    const patch = toBusinessFactsPatch(parsed)
    expect(patch.services[0]?.source).toBe('own_website')
    expect(patch.accreditations[0]?.source).toBe('own_website')
    expect(patch.foundedYear?.source).toBe('own_website')
    expect(patch.claims[0]?.source).toBe('own_website')
    expect(patch.email?.source).toBe('own_website')
    expect(patch.phone?.source).toBe('own_website')
    expect(patch.serviceAreas).toEqual(['Leeds'])
  })
})

const markdown = fixture.scrapeMarkdown as string

function emptyPatch(): ExtractedFactsPatch {
  return { services: [], serviceAreas: [], accreditations: [], claims: [] }
}

describe('verifyExtractedFacts — the extraction-side FACT-GUARD', () => {
  it('keeps facts whose quotes appear verbatim in the markdown', () => {
    const patch: ExtractedFactsPatch = {
      ...emptyPatch(),
      services: [
        {
          value: 'Boiler repairs',
          source: 'own_website',
          quote: 'We repair and service all makes of boiler',
        },
      ],
      accreditations: [
        { id: 'watersafe', source: 'own_website', quote: 'WaterSafe approved installer' },
      ],
      foundedYear: { value: 2011, source: 'own_website', quote: 'serving Leeds since 2011' },
    }
    const { kept, dropped } = verifyExtractedFacts(patch, markdown)
    expect(dropped).toEqual([])
    expect(kept.services).toHaveLength(1)
    expect(kept.accreditations).toEqual([
      { id: 'watersafe', source: 'own_website', quote: 'WaterSafe approved installer' },
    ])
    expect(kept.foundedYear?.value).toBe(2011)
  })

  it('drops fabricated facts that carry no quote', () => {
    const patch: ExtractedFactsPatch = {
      ...emptyPatch(),
      services: [{ value: 'Wet rooms', source: 'own_website' }],
    }
    const { kept, dropped } = verifyExtractedFacts(patch, markdown)
    expect(kept.services).toEqual([])
    expect(dropped).toEqual([{ field: 'services', reason: 'missing quote' }])
  })

  it('drops facts whose quote does not appear in the markdown', () => {
    const patch: ExtractedFactsPatch = {
      ...emptyPatch(),
      claims: [
        {
          value: '25 year guarantee',
          source: 'own_website',
          quote: 'all work guaranteed for 25 years',
        },
      ],
    }
    const { kept, dropped } = verifyExtractedFacts(patch, markdown)
    expect(kept.claims).toEqual([])
    expect(dropped).toHaveLength(1)
    expect(dropped[0]?.field).toBe('claims')
    expect(dropped[0]?.reason).toMatch(/not found/)
    expect(dropped[0]?.quote).toBe('all work guaranteed for 25 years')
  })

  it('whitespace-normalizes both sides so quotes may span line breaks', () => {
    const wrappedMarkdown = 'We are a family firm.\nWe repair and\n  service all makes\nof boiler.'
    const patch: ExtractedFactsPatch = {
      ...emptyPatch(),
      services: [
        {
          value: 'Boiler repairs',
          source: 'own_website',
          quote: 'We repair and service all makes of boiler',
        },
      ],
    }
    const { kept, dropped } = verifyExtractedFacts(patch, wrappedMarkdown)
    expect(dropped).toEqual([])
    expect(kept.services).toHaveLength(1)
  })

  it('drops accreditations with ids outside the registry, even when quoted', () => {
    const patch: ExtractedFactsPatch = {
      ...emptyPatch(),
      accreditations: [
        // Quote IS in the markdown, but the id is not a registry id.
        { id: 'checkatrade', source: 'own_website', quote: 'WaterSafe approved installer' },
        { id: 'watersafe', source: 'own_website', quote: 'WaterSafe approved installer' },
      ],
    }
    const { kept, dropped } = verifyExtractedFacts(patch, markdown)
    expect(kept.accreditations).toHaveLength(1)
    expect(kept.accreditations[0]?.id).toBe('watersafe')
    expect(dropped).toEqual([
      {
        field: 'accreditations',
        reason: 'unknown accreditation id: checkatrade',
        quote: 'WaterSafe approved installer',
      },
    ])
  })

  it('drops unevidenced email/phone/foundedYear but keeps serviceAreas', () => {
    const patch: ExtractedFactsPatch = {
      ...emptyPatch(),
      serviceAreas: ['Leeds', 'Headingley'],
      foundedYear: { value: 1999, source: 'own_website', quote: 'est. 1999' },
      email: {
        value: 'info@swiftflowplumbing.example',
        source: 'own_website',
        quote: 'info@swiftflowplumbing.example',
      },
      phone: { value: '0113 000 0000', source: 'own_website', quote: '0113 000 0000' },
    }
    const { kept, dropped } = verifyExtractedFacts(patch, markdown)
    expect(kept.serviceAreas).toEqual(['Leeds', 'Headingley'])
    expect(kept.email?.value).toBe('info@swiftflowplumbing.example')
    expect(kept.foundedYear).toBeUndefined()
    expect(kept.phone).toBeUndefined()
    expect(dropped.map((d) => d.field).sort()).toEqual(['foundedYear', 'phone'])
  })
})

describe('FixtureFactsExtractor', () => {
  it('round-trips a fixture: candidate parses, verifies clean and keeps the evidenced facts', async () => {
    const extractor = new FixtureFactsExtractor()
    const result = await extractor.extractFacts(extractInput)

    expect(result.model).toBe('fixture-extractor-v1')
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })

    const parsed = extractedFactsSchema.parse(result.candidate)
    const patch = toBusinessFactsPatch(parsed)
    const { kept, dropped } = verifyExtractedFacts(patch, extractInput.markdown)

    expect(dropped).toEqual([])
    expect(kept.services.map((s) => s.value)).toEqual([
      'Boiler repairs',
      'Bathroom installation',
      'Emergency plumbing',
    ])
    expect(kept.accreditations.map((a) => a.id)).toEqual(['watersafe'])
    expect(kept.foundedYear?.value).toBe(2011)
    expect(kept.email?.value).toBe('info@swiftflowplumbing.example')
    // Fixture phone is overture-sourced, so it never enters the extraction candidate.
    expect(kept.phone).toBeUndefined()
    expect(kept.serviceAreas).toContain('Headingley')
  })

  it('only returns own_website-sourced facts', async () => {
    const extractor = new FixtureFactsExtractor()
    const { candidate } = await extractor.extractFacts(extractInput)
    const parsed = extractedFactsSchema.parse(candidate)
    expect(parsed.phone).toBeUndefined()
  })

  it('resolves via a constructor-passed map keyed by businessName', async () => {
    const extractor = new FixtureFactsExtractor({
      'Swift Flow Plumbing': getFixture('sheffield-electrician-hallam').facts,
    })
    const { candidate } = await extractor.extractFacts(extractInput)
    const parsed = extractedFactsSchema.parse(candidate)
    expect(parsed.accreditations.map((a) => a.id)).toEqual(['niceic'])
  })

  it('throws for unknown businesses', async () => {
    const extractor = new FixtureFactsExtractor()
    await expect(
      extractor.extractFacts({
        businessName: 'Unknown Trades Ltd',
        trade: 'plumber',
        town: 'Leeds',
        markdown: '# Unknown Trades Ltd',
      }),
    ).rejects.toThrow(/No fixture facts/)
  })
})
