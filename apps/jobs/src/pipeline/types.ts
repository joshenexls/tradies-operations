import type { Trade } from '@tradies/site-spec'

/**
 * Structural views of the provider interfaces (defined in
 * @tradies/integrations and @tradies/llm) — the pipeline depends on shapes,
 * not classes, so tests can hand in anything conforming.
 */

export type ApifyPlaceItem = {
  placeId: string
  title: string
  categoryName?: string
  address?: string
  postcode?: string
  city?: string
  phone?: string
  website?: string
  totalScore?: number
  url?: string
}

export type DiscoveryClient = {
  runGoogleMapsSearch(input: {
    city: string
    trade: Trade
    maxPlaces: number
  }): Promise<{ runId: string; items: ApifyPlaceItem[] }>
}

export type ScrapeClient = {
  scrape(
    url: string,
  ): Promise<{ markdown: string; screenshotRef?: string; screenshotBase64?: string }>
}

export type PsiScorer = {
  score(url: string): Promise<{ performance: number; https: boolean }>
}

export type ScreenshotJudge = {
  judge(input: {
    imageBase64: string
    mediaType: 'image/png' | 'image/jpeg'
    context?: string
  }): Promise<{ score: number; issues: string[] }>
}

export type FactsExtractionClient = {
  extractFacts(input: {
    businessName: string
    trade: Trade
    town: string
    markdown: string
  }): Promise<{
    candidate: unknown
    model: string
    usage: { inputTokens: number; outputTokens: number }
  }>
}
