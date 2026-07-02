import {
  FixtureApifyClient,
  FixtureFirecrawlClient,
  FixturePsiClient,
  FixtureVisionJudge,
  RealApifyClient,
  RealFirecrawlClient,
  RealPsiClient,
  HaikuVisionJudge,
} from '@tradies/integrations'
import { AnthropicFactsExtractor, FixtureFactsExtractor } from '@tradies/llm'
import type {
  DiscoveryClient,
  FactsExtractionClient,
  PsiScorer,
  ScrapeClient,
  ScreenshotJudge,
} from '../pipeline/types'

export type PipelineClients = {
  apify: DiscoveryClient
  firecrawl: ScrapeClient
  psi: PsiScorer
  judge?: ScreenshotJudge
  extractor: FactsExtractionClient
}

/** INTEGRATIONS=fixture (default) runs the whole pipeline offline. */
export function resolveClients(env: NodeJS.ProcessEnv = process.env): PipelineClients {
  if ((env.INTEGRATIONS ?? 'fixture') === 'real') {
    const missing = (['APIFY_TOKEN', 'FIRECRAWL_API_KEY', 'ANTHROPIC_API_KEY'] as const).filter(
      (k) => !env[k],
    )
    if (missing.length > 0) {
      throw new Error(`INTEGRATIONS=real requires: ${missing.join(', ')} (plan §Stage B env)`)
    }
    return {
      apify: new RealApifyClient({
        token: env.APIFY_TOKEN!,
        actorId: env.APIFY_ACTOR_ID ?? 'compass~crawler-google-places',
      }),
      firecrawl: new RealFirecrawlClient({ apiKey: env.FIRECRAWL_API_KEY! }),
      psi: new RealPsiClient({ apiKey: env.PAGESPEED_API_KEY }),
      judge: new HaikuVisionJudge({
        apiKey: env.ANTHROPIC_API_KEY!,
        model: env.JUDGE_MODEL ?? 'claude-haiku-4-5',
      }),
      extractor: new AnthropicFactsExtractor({
        apiKey: env.ANTHROPIC_API_KEY!,
        model: env.JUDGE_MODEL ?? 'claude-haiku-4-5',
      }),
    }
  }
  return {
    apify: new FixtureApifyClient(),
    firecrawl: new FixtureFirecrawlClient(),
    psi: new FixturePsiClient(),
    judge: new FixtureVisionJudge(),
    extractor: new FixtureFactsExtractor(),
  }
}
