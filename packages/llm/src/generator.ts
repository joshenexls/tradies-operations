import type { BusinessFacts, StylePreset } from '@tradies/site-spec'

export type GenerationInput = {
  facts: BusinessFacts
  preset: StylePreset
  /** Operator feedback from the review loop, e.g. "shorter headline". */
  feedback?: string
}

export type GenerationResult = {
  /** Raw candidate spec — callers must run siteSpecSchema + FACT-GUARD before use. */
  candidate: unknown
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface SiteSpecGenerator {
  generateSiteSpec(input: GenerationInput): Promise<GenerationResult>
}
