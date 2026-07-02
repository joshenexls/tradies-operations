import type Anthropic from '@anthropic-ai/sdk'
import { allDesignTemplateFixtures, allProspectFixtures, getFixture } from '@tradies/fixtures'
import type { ContentDoc } from '@tradies/site-spec'
import {
  contentDocSchemaFor,
  slotManifestSchema,
  validateContentDocAgainstFacts,
} from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import type { AnthropicMessagesClient } from './anthropic-generator'
import {
  AnthropicContentDocGenerator,
  EMIT_CONTENT_DOC_TOOL,
  FixtureContentDocGenerator,
} from './content-doc-generator'

const NOW = new Date('2026-07-01')
const IMAGERY_POOL = 'general-modern'

const manifests = allDesignTemplateFixtures.map((f) => ({
  key: f.key,
  manifest: slotManifestSchema.parse(f.expectedManifest),
}))

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
    usage: { input_tokens: 1111, output_tokens: 222 },
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
  { type: 'tool_use', id: 'toolu_1', name: EMIT_CONTENT_DOC_TOOL, input: { slots: {} } },
] as unknown as Anthropic.Message['content']

const facts = getFixture('leeds-plumber-swift').facts
const craftsman = manifests[0]!

describe('AnthropicContentDocGenerator', () => {
  it('forces structured output through emit_content_doc with the manifest-built schema', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicContentDocGenerator({ client })
    await generator.generateContentDoc({
      facts,
      manifest: craftsman.manifest,
      imageryPool: IMAGERY_POOL,
      tone: 'professional',
      sampleTexts: {},
    })

    const params = calls[0]
    expect(params?.model).toBe('claude-sonnet-5')
    expect(params?.tool_choice).toEqual({ type: 'tool', name: EMIT_CONTENT_DOC_TOOL })
    const tool = params?.tools?.[0] as Anthropic.Tool
    expect(tool.name).toBe(EMIT_CONTENT_DOC_TOOL)
    const properties = tool.input_schema.properties as Record<string, { properties?: object }>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['slots', 'repeats', 'images', 'repeatImages']),
    )
    // the schema is manifest-derived: slot ids appear as required properties
    expect(Object.keys(properties.slots?.properties ?? {})).toEqual(
      craftsman.manifest.slots.map((s) => s.id),
    )
  })

  it('sends the content-doc-v1 prompt: rules, tone, per-slot guidance, samples, feedback', async () => {
    const { client, calls } = makeStub(toolUseContent)
    const generator = new AnthropicContentDocGenerator({ client })
    await generator.generateContentDoc({
      facts,
      manifest: craftsman.manifest,
      imageryPool: IMAGERY_POOL,
      tone: 'premium',
      sampleTexts: { 'hero-headline': 'Honest Craftsmanship for Your Home' },
      feedback: 'shorter headline',
    })

    const params = calls[0]
    expect(params?.system).toContain('Never write reviews, testimonials')
    expect(params?.system).toContain('premium')
    expect(params?.system).toContain(IMAGERY_POOL)
    expect(params?.system).toContain(facts.phone?.value)
    const userText = params?.messages[0]?.content as string
    expect(userText).toContain('Swift Flow Plumbing')
    expect(userText).toContain('hero-headline (headline, max 80 chars)')
    expect(userText).toContain('Honest Craftsmanship for Your Home')
    expect(userText).toContain('match this energy and length')
    expect(userText).toContain('shorter headline')
  })

  it('extracts the tool_use input as the candidate and maps usage', async () => {
    const { client } = makeStub(toolUseContent)
    const generator = new AnthropicContentDocGenerator({ client })
    const result = await generator.generateContentDoc({
      facts,
      manifest: craftsman.manifest,
      imageryPool: IMAGERY_POOL,
      tone: 'friendly',
      sampleTexts: {},
    })
    expect(result.candidate).toEqual({ slots: {} })
    expect(result.usage).toEqual({ inputTokens: 1111, outputTokens: 222 })
  })

  it('throws when the response has no tool_use block', async () => {
    const { client } = makeStub([
      { type: 'text', text: 'no' },
    ] as unknown as Anthropic.Message['content'])
    const generator = new AnthropicContentDocGenerator({ client })
    await expect(
      generator.generateContentDoc({
        facts,
        manifest: craftsman.manifest,
        imageryPool: IMAGERY_POOL,
        tone: 'friendly',
        sampleTexts: {},
      }),
    ).rejects.toThrow(/tool_use/)
  })
})

describe('FixtureContentDocGenerator', () => {
  const generator = new FixtureContentDocGenerator()
  const tones = ['friendly', 'professional', 'premium', 'no-nonsense']

  for (const { key, manifest } of manifests) {
    describe(`manifest "${key}"`, () => {
      for (const fixture of allProspectFixtures) {
        it(`produces a schema-valid, fact-grounded doc for ${fixture.key}`, async () => {
          const tone = tones[(fixture.key.length + key.length) % tones.length]!
          const result = await generator.generateContentDoc({
            facts: fixture.facts,
            manifest,
            imageryPool: IMAGERY_POOL,
            tone,
            sampleTexts: {},
          })

          const schema = contentDocSchemaFor(manifest, { imageryPool: IMAGERY_POOL })
          const parsed = schema.safeParse(result.candidate)
          expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(true)
          if (!parsed.success) return

          const doc = parsed.data as ContentDoc
          const report = validateContentDocAgainstFacts(doc, manifest, fixture.facts, {
            now: NOW,
          })
          expect(report.violations).toEqual([])
          expect(report.ok).toBe(true)
        })
      }
    })
  }

  it('is deterministic: the same input twice yields deep-equal candidates', async () => {
    for (const { manifest } of manifests) {
      const input = {
        facts: getFixture('york-heating-minster').facts,
        manifest,
        imageryPool: IMAGERY_POOL,
        tone: 'friendly',
        sampleTexts: {},
      }
      expect(await generator.generateContentDoc(input)).toEqual(
        await generator.generateContentDoc(input),
      )
    }
  })

  it('emits repeatImages only for groups that declare itemImages', async () => {
    const result = await generator.generateContentDoc({
      facts,
      manifest: craftsman.manifest,
      imageryPool: IMAGERY_POOL,
      tone: 'friendly',
      sampleTexts: {},
    })
    const doc = contentDocSchemaFor(craftsman.manifest, { imageryPool: IMAGERY_POOL }).parse(
      result.candidate,
    ) as ContentDoc
    expect(Object.keys(doc.repeatImages)).toEqual(['services'])
    expect(doc.repeatImages.services).toHaveLength(doc.repeats.services?.length ?? 0)
    for (const image of doc.repeatImages.services ?? []) {
      expect(image.pool).toBe(IMAGERY_POOL)
      expect(image.index).toBeGreaterThanOrEqual(0)
      expect(image.index).toBeLessThanOrEqual(5)
    }
  })

  it('fills area repeat items only from evidenced areas', async () => {
    const coastal = manifests.find((m) => m.key === 'coastal-light')!
    const fixture = getFixture('sheffield-electrician-hallam')
    const result = await generator.generateContentDoc({
      facts: fixture.facts,
      manifest: coastal.manifest,
      imageryPool: IMAGERY_POOL,
      tone: 'no-nonsense',
      sampleTexts: {},
    })
    const doc = contentDocSchemaFor(coastal.manifest, { imageryPool: IMAGERY_POOL }).parse(
      result.candidate,
    ) as ContentDoc
    const allowed = new Set(
      [fixture.facts.town, ...fixture.facts.serviceAreas].map((a) => a.toLowerCase()),
    )
    for (const item of doc.repeats.areas ?? []) {
      expect(allowed.has(item['area-name']?.toLowerCase() ?? '')).toBe(true)
    }
  })

  it('reports a model id and plausible usage', async () => {
    const result = await generator.generateContentDoc({
      facts,
      manifest: craftsman.manifest,
      imageryPool: IMAGERY_POOL,
      tone: 'friendly',
      sampleTexts: {},
    })
    expect(result.model).toBe('fixture-content-doc-v1')
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  })
})
