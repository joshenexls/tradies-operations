import {
  FixtureApifyClient,
  FixtureFirecrawlClient,
  FixturePsiClient,
  FixtureResendMailer,
  FixtureSmartleadClient,
  FixtureVisionJudge,
  RealApifyClient,
  RealFirecrawlClient,
  RealPsiClient,
  RealResendMailer,
  RealSmartleadClient,
  HaikuVisionJudge,
  type ResendMailer,
  type SmartleadClient,
} from '@tradies/integrations'
import {
  AnthropicFactsExtractor,
  AnthropicPitchGenerator,
  FixtureFactsExtractor,
  FixturePitchGenerator,
  type PitchGenerator,
} from '@tradies/llm'
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

/**
 * PITCH_GENERATOR=fixture (default) keeps pitch generation offline;
 * =anthropic requires ANTHROPIC_API_KEY and fails fast without it.
 */
export function resolvePitchGenerator(env: NodeJS.ProcessEnv = process.env): PitchGenerator {
  const mode = env.PITCH_GENERATOR ?? 'fixture'
  if (mode === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('PITCH_GENERATOR=anthropic requires ANTHROPIC_API_KEY')
    return new AnthropicPitchGenerator({ apiKey })
  }
  if (mode !== 'fixture') {
    throw new Error(`Unknown PITCH_GENERATOR "${mode}" (fixture | anthropic)`)
  }
  return new FixturePitchGenerator()
}

/** Real Smartlead only when a key is present — every other environment stays offline. */
export function resolveSmartlead(env: NodeJS.ProcessEnv = process.env): SmartleadClient {
  if (env.SMARTLEAD_API_KEY) return new RealSmartleadClient({ apiKey: env.SMARTLEAD_API_KEY })
  return new FixtureSmartleadClient()
}

/** Real Resend only when a key is present — every other environment stays offline. */
export function resolveResendMailer(env: NodeJS.ProcessEnv = process.env): ResendMailer {
  if (env.RESEND_API_KEY) return new RealResendMailer({ apiKey: env.RESEND_API_KEY })
  return new FixtureResendMailer()
}

/** Real Stripe only when STRIPE_SECRET_KEY is present — the integrations resolver decides. */
export { resolveStripe } from '@tradies/integrations'
