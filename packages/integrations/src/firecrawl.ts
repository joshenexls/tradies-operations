import { allProspectFixtures } from '@tradies/fixtures'
import type { CostRecorder } from './types'
import { NotFoundError } from './types'

export interface FirecrawlClient {
  scrape(url: string): Promise<{ markdown: string; screenshotRef?: string }>
}

/** Serves the fixture's stored scrapeMarkdown; unknown urls raise NotFoundError. */
export class FixtureFirecrawlClient implements FirecrawlClient {
  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async scrape(url: string): Promise<{ markdown: string; screenshotRef?: string }> {
    const fixture = allProspectFixtures.find((f) => f.websiteUrl === url && f.scrapeMarkdown)
    if (!fixture?.scrapeMarkdown) {
      throw new NotFoundError(`No fixture scrape for url: ${url}`)
    }
    this.options.recordCost?.({
      category: 'firecrawl',
      provider: 'firecrawl-fixture',
      units: 1,
      amountMicroGbp: 1_600, // ~£0.0016 per scrape credit
      ref: url,
    })
    return { markdown: fixture.scrapeMarkdown, screenshotRef: `fx-screenshot-${fixture.key}` }
  }
}
