import { getFixture } from '@tradies/fixtures'
import { ACCREDITATION_IDS } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import { buildExtractFactsPrompt, EXTRACT_FACTS_MARKDOWN_LIMIT } from './extract-facts-v1'

const fixture = getFixture('leeds-plumber-swift')

const input = {
  businessName: fixture.businessName,
  trade: fixture.trade,
  town: fixture.town,
  markdown: fixture.scrapeMarkdown as string,
}

describe('buildExtractFactsPrompt', () => {
  it('includes the business context in the system prompt', () => {
    const prompt = buildExtractFactsPrompt(input)
    expect(prompt.version).toBe('extract-facts-v1')
    expect(prompt.system).toContain('Swift Flow Plumbing')
    expect(prompt.system).toContain('plumbing')
    expect(prompt.system).toContain('Leeds')
    expect(prompt.system).toContain('emit_facts')
  })

  it('states the extraction rules: quotes, no inference, UK English', () => {
    const { system } = buildExtractFactsPrompt(input)
    expect(system).toMatch(/explicitly present/i)
    expect(system).toMatch(/verbatim/i)
    expect(system).toMatch(/no inference/i)
    expect(system).toMatch(/UK English/i)
  })

  it('lists every allowed accreditation id with its label', () => {
    const { system } = buildExtractFactsPrompt(input)
    for (const id of ACCREDITATION_IDS) {
      expect(system).toContain(id)
    }
    expect(system).toContain('Gas Safe Registered')
    expect(system).toContain('WaterSafe Approved')
  })

  it('puts the markdown in the user message untouched when short enough', () => {
    const prompt = buildExtractFactsPrompt(input)
    expect(prompt.user).toContain(input.markdown)
    expect(prompt.user).not.toContain('truncated')
  })

  it('truncates very long markdown and says so', () => {
    const longMarkdown = 'boiler repair leeds '.repeat(3_000) // ~60k chars
    expect(longMarkdown.length).toBeGreaterThan(EXTRACT_FACTS_MARKDOWN_LIMIT)
    const prompt = buildExtractFactsPrompt({ ...input, markdown: longMarkdown })
    expect(prompt.user).toContain(longMarkdown.slice(0, EXTRACT_FACTS_MARKDOWN_LIMIT))
    expect(prompt.user).not.toContain(longMarkdown)
    expect(prompt.user).toContain(`truncated at ${EXTRACT_FACTS_MARKDOWN_LIMIT}`)
  })
})
