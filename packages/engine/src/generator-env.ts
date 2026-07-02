import { AnthropicSiteSpecGenerator, FixtureLLM, type SiteSpecGenerator } from '@tradies/llm'

/**
 * SITE_GENERATOR=fixture (default) keeps every environment runnable with no
 * keys; =anthropic requires ANTHROPIC_API_KEY and fails fast without it.
 */
export function resolveGeneratorFromEnv(env: NodeJS.ProcessEnv = process.env): SiteSpecGenerator {
  const mode = env.SITE_GENERATOR ?? 'fixture'
  if (mode === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'SITE_GENERATOR=anthropic requires ANTHROPIC_API_KEY (needed from Phase 2; Anthropic Console)',
      )
    }
    return new AnthropicSiteSpecGenerator({
      apiKey,
      model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    })
  }
  if (mode !== 'fixture') throw new Error(`Unknown SITE_GENERATOR "${mode}" (fixture | anthropic)`)
  return new FixtureLLM()
}
