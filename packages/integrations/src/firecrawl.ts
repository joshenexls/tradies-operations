import { allProspectFixtures } from '@tradies/fixtures'
import type { CostRecorder, FetchLike } from './types'
import { NotFoundError } from './types'

export type FirecrawlScrapeResult = {
  markdown: string
  /** Remote reference (URL) to the page screenshot, when the API returns one. */
  screenshotRef?: string
  /** Inline base64 screenshot payload, when the API returns one. */
  screenshotBase64?: string
}

export interface FirecrawlClient {
  scrape(url: string): Promise<FirecrawlScrapeResult>
}

/** Serves the fixture's stored scrapeMarkdown; unknown urls raise NotFoundError. */
export class FixtureFirecrawlClient implements FirecrawlClient {
  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async scrape(url: string): Promise<FirecrawlScrapeResult> {
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

/** Raised for non-2xx Firecrawl responses; status carries the HTTP code. */
export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'FirecrawlError'
  }
}

/** ~1 Firecrawl credit per scrape. */
export const FIRECRAWL_COST_PER_SCRAPE_MICRO_GBP = 1_300

export type RealFirecrawlClientOptions = {
  apiKey: string
  /** Injectable for tests — adapter tests must never hit the network. */
  fetchImpl?: FetchLike
  costPerScrapeMicroGbp?: number
  recordCost?: CostRecorder
}

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape'

function firecrawlErrorMessage(status: number): string {
  if (status === 402) return 'Firecrawl payment required — out of credits (HTTP 402)'
  if (status === 429) return 'Firecrawl rate limited (HTTP 429)'
  if (status >= 500) return `Firecrawl server error (HTTP ${status})`
  return `Firecrawl request failed (HTTP ${status})`
}

const DATA_URI_PREFIX = /^data:image\/[a-z+]+;base64,/

export class RealFirecrawlClient implements FirecrawlClient {
  private readonly fetchImpl: FetchLike

  constructor(private readonly options: RealFirecrawlClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async scrape(url: string): Promise<FirecrawlScrapeResult> {
    const response = await this.fetchImpl(FIRECRAWL_SCRAPE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown', 'screenshot'] }),
    })
    if (!response.ok) {
      throw new FirecrawlError(firecrawlErrorMessage(response.status), response.status)
    }
    const body = (await response.json()) as {
      data?: { markdown?: string; screenshot?: string }
    }
    const markdown = body.data?.markdown
    if (typeof markdown !== 'string') {
      throw new FirecrawlError('Firecrawl response missing markdown', response.status)
    }
    this.options.recordCost?.({
      category: 'firecrawl',
      provider: 'firecrawl',
      units: 1,
      amountMicroGbp: this.options.costPerScrapeMicroGbp ?? FIRECRAWL_COST_PER_SCRAPE_MICRO_GBP,
      ref: url,
    })
    const result: FirecrawlScrapeResult = { markdown }
    const screenshot = body.data?.screenshot
    if (typeof screenshot === 'string' && screenshot.length > 0) {
      // The API returns either a hosted URL or (data-uri wrapped) base64
      // depending on plan/format — store whichever came back.
      if (screenshot.startsWith('http://') || screenshot.startsWith('https://')) {
        result.screenshotRef = screenshot
      } else {
        result.screenshotBase64 = screenshot.replace(DATA_URI_PREFIX, '')
      }
    }
    return result
  }
}
