import {
  AnthropicContentDocGenerator,
  AnthropicSiteSpecGenerator,
  AnthropicTemplateIngestor,
  FixtureContentDocGenerator,
  FixtureLLM,
  FixtureTemplateIngestor,
  type ContentDocGenerator,
  type SiteSpecGenerator,
  type TemplateIngestor,
} from '@tradies/llm'

/**
 * SITE_GENERATOR=fixture (default) keeps every environment runnable with no
 * keys; =anthropic requires ANTHROPIC_API_KEY and fails fast without it.
 */
export function resolveGeneratorFromEnv(env: NodeJS.ProcessEnv = process.env): SiteSpecGenerator {
  const mode = env.SITE_GENERATOR ?? 'fixture'
  if (mode === 'anthropic') {
    return new AnthropicSiteSpecGenerator({
      apiKey: requireAnthropicKey(env, 'SITE_GENERATOR'),
      model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    })
  }
  if (mode !== 'fixture') throw new Error(`Unknown SITE_GENERATOR "${mode}" (fixture | anthropic)`)
  return new FixtureLLM()
}

/**
 * Content docs are site generation for html-kind design systems, so they
 * follow the same SITE_GENERATOR switch as component specs.
 */
export function resolveContentDocGeneratorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ContentDocGenerator {
  const mode = env.SITE_GENERATOR ?? 'fixture'
  if (mode === 'anthropic') {
    return new AnthropicContentDocGenerator({
      apiKey: requireAnthropicKey(env, 'SITE_GENERATOR'),
      model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    })
  }
  if (mode !== 'fixture') throw new Error(`Unknown SITE_GENERATOR "${mode}" (fixture | anthropic)`)
  return new FixtureContentDocGenerator()
}

/**
 * TEMPLATE_INGESTOR=fixture (default) resolves uploaded landers against the
 * shipped fixture annotations; =anthropic annotates real uploads with Claude.
 */
export function resolveTemplateIngestorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TemplateIngestor {
  const mode = env.TEMPLATE_INGESTOR ?? 'fixture'
  if (mode === 'anthropic') {
    return new AnthropicTemplateIngestor({
      apiKey: requireAnthropicKey(env, 'TEMPLATE_INGESTOR'),
      model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    })
  }
  if (mode !== 'fixture') {
    throw new Error(`Unknown TEMPLATE_INGESTOR "${mode}" (fixture | anthropic)`)
  }
  return new FixtureTemplateIngestor()
}

function requireAnthropicKey(env: NodeJS.ProcessEnv, flag: string): string {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(`${flag}=anthropic requires ANTHROPIC_API_KEY (Anthropic Console)`)
  }
  return apiKey
}
