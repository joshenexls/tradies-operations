import { allProspectFixtures } from '@tradies/fixtures'
import type { Trade } from '@tradies/site-spec'
import { TRADE_LABELS } from '@tradies/site-spec'
import type { CostRecorder, FetchLike } from './types'

/**
 * Discovery via the Apify Google Maps scraper (founder decision: the old
 * Google Places containment boundary is retired — Apify payloads are ours to
 * warehouse). totalScore is informational for triage only and must NEVER be
 * rendered on a generated site (DMCC: no third-party review content).
 */

export type ApifyPlaceResult = {
  placeId: string
  title: string
  categoryName?: string
  address?: string
  postcode?: string
  city?: string
  /** As scraped, unnormalized. */
  phone?: string
  website?: string
  /** Google rating, informational only — never rendered on sites (DMCC). */
  totalScore?: number
  /** Google Maps URL. */
  url?: string
}

export interface ApifyClient {
  runGoogleMapsSearch(input: {
    city: string
    trade: Trade
    maxPlaces: number
  }): Promise<{ runId: string; items: ApifyPlaceResult[] }>
}

/** ~£0.0024 per scraped place on the pay-per-result actor. */
export const APIFY_COST_PER_PLACE_MICRO_GBP = 2_400

export const DEFAULT_APIFY_ACTOR_ID = 'compass~crawler-google-places'

/** Raised when an Apify run ends in a non-success state or the API misbehaves. */
export class ApifyRunError extends Error {
  constructor(
    message: string,
    readonly runId?: string,
    readonly runStatus?: string,
  ) {
    super(message)
    this.name = 'ApifyRunError'
  }
}

/** Maps a scraped Google Maps categoryName onto our trade taxonomy. */
export function categoryToTrade(categoryName: string | undefined): Trade {
  if (!categoryName) return 'other'
  const category = categoryName.toLowerCase()
  if (category.includes('plumb')) return 'plumber'
  if (category.includes('electric')) return 'electrician'
  if (category.includes('roof')) return 'roofer'
  if (
    category.includes('heating') ||
    category.includes('gas') ||
    category.includes('boiler') ||
    category.includes('hvac')
  ) {
    return 'heating'
  }
  if (category.includes('build') || category.includes('construction')) return 'builder'
  return 'other'
}

export class FixtureApifyClient implements ApifyClient {
  constructor(
    private readonly options: { recordCost?: CostRecorder; costPerPlaceMicroGbp?: number } = {},
  ) {}

  async runGoogleMapsSearch(input: {
    city: string
    trade: Trade
    maxPlaces: number
  }): Promise<{ runId: string; items: ApifyPlaceResult[] }> {
    const runId = `fixture-run-${input.city}-${input.trade}`
    const items = allProspectFixtures
      .filter((f) => f.trade === input.trade && f.town.toLowerCase() === input.city.toLowerCase())
      .slice(0, input.maxPlaces)
      .map((f): ApifyPlaceResult => {
        const item: ApifyPlaceResult = {
          placeId: f.places.placeId,
          title: f.overture.name,
          categoryName: TRADE_LABELS[input.trade],
          city: f.town,
        }
        if (f.overture.address !== undefined) item.address = f.overture.address
        if (f.overture.postcode !== undefined) item.postcode = f.overture.postcode
        if (f.overture.phone !== undefined) item.phone = f.overture.phone
        if (f.overture.website !== undefined) item.website = f.overture.website
        return item
      })
    for (const _item of items) {
      this.options.recordCost?.({
        category: 'places',
        provider: 'apify-fixture',
        units: 1,
        amountMicroGbp: this.options.costPerPlaceMicroGbp ?? APIFY_COST_PER_PLACE_MICRO_GBP,
        ref: runId,
      })
    }
    return { runId, items }
  }
}

export type RealApifyClientOptions = {
  token: string
  /** Apify actor to run; defaults to the Google Maps scraper. */
  actorId?: string
  costPerPlaceMicroGbp?: number
  /** Injectable for tests — adapter tests must never hit the network. */
  fetchImpl?: FetchLike
  pollIntervalMs?: number
  maxPollMs?: number
  recordCost?: CostRecorder
}

const APIFY_API_BASE = 'https://api.apify.com/v2'

type RawApifyItem = Record<string, unknown>

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Tolerates missing fields and Apify's postCode/postalCode + phoneUnformatted variants. */
export function normalizeApifyItem(item: RawApifyItem): ApifyPlaceResult | null {
  const placeId = asString(item['placeId'])
  const title = asString(item['title'])
  if (!placeId || !title) return null
  const result: ApifyPlaceResult = { placeId, title }
  const categoryName = asString(item['categoryName'])
  if (categoryName !== undefined) result.categoryName = categoryName
  const address = asString(item['address'])
  if (address !== undefined) result.address = address
  const postcode = asString(item['postCode']) ?? asString(item['postalCode'])
  if (postcode !== undefined) result.postcode = postcode
  const city = asString(item['city'])
  if (city !== undefined) result.city = city
  const phone = asString(item['phone']) ?? asString(item['phoneUnformatted'])
  if (phone !== undefined) result.phone = phone
  const website = asString(item['website'])
  if (website !== undefined) result.website = website
  const totalScore = asNumber(item['totalScore'])
  if (totalScore !== undefined) result.totalScore = totalScore
  const url = asString(item['url'])
  if (url !== undefined) result.url = url
  return result
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class RealApifyClient implements ApifyClient {
  private readonly actorId: string
  private readonly fetchImpl: FetchLike
  private readonly pollIntervalMs: number
  private readonly maxPollMs: number

  constructor(private readonly options: RealApifyClientOptions) {
    this.actorId = options.actorId ?? DEFAULT_APIFY_ACTOR_ID
    this.fetchImpl = options.fetchImpl ?? fetch
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000
    this.maxPollMs = options.maxPollMs ?? 5 * 60_000
  }

  private tokenParam(): string {
    return `token=${encodeURIComponent(this.options.token)}`
  }

  async runGoogleMapsSearch(input: {
    city: string
    trade: Trade
    maxPlaces: number
  }): Promise<{ runId: string; items: ApifyPlaceResult[] }> {
    const { runId, datasetId } = await this.startRun(input)
    await this.waitForRun(runId)
    const items = await this.fetchItems(datasetId)
    for (const _item of items) {
      this.options.recordCost?.({
        category: 'places',
        provider: 'apify',
        units: 1,
        amountMicroGbp: this.options.costPerPlaceMicroGbp ?? APIFY_COST_PER_PLACE_MICRO_GBP,
        ref: runId,
      })
    }
    return { runId, items }
  }

  private async startRun(input: {
    city: string
    trade: Trade
    maxPlaces: number
  }): Promise<{ runId: string; datasetId: string }> {
    const response = await this.fetchImpl(
      `${APIFY_API_BASE}/acts/${this.actorId}/runs?${this.tokenParam()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [`${TRADE_LABELS[input.trade]} ${input.city}`],
          maxCrawledPlacesPerSearch: input.maxPlaces,
          language: 'en',
          countryCode: 'gb',
        }),
      },
    )
    if (!response.ok) {
      throw new ApifyRunError(`Apify run start failed with HTTP ${response.status}`)
    }
    const body = (await response.json()) as {
      data?: { id?: string; defaultDatasetId?: string }
    }
    const runId = body.data?.id
    const datasetId = body.data?.defaultDatasetId
    if (!runId || !datasetId) {
      throw new ApifyRunError('Apify run start response missing run id or dataset id')
    }
    return { runId, datasetId }
  }

  private async waitForRun(runId: string): Promise<void> {
    const startedAt = Date.now()
    for (;;) {
      const response = await this.fetchImpl(
        `${APIFY_API_BASE}/actor-runs/${runId}?${this.tokenParam()}`,
      )
      if (!response.ok) {
        throw new ApifyRunError(`Apify run status check failed with HTTP ${response.status}`, runId)
      }
      const body = (await response.json()) as { data?: { status?: string } }
      const status = body.data?.status
      if (status === 'SUCCEEDED') return
      if (status === 'ABORTED' || status === 'FAILED' || status === 'TIMED-OUT') {
        throw new ApifyRunError(`Apify run ${runId} ended with status ${status}`, runId, status)
      }
      if (Date.now() - startedAt >= this.maxPollMs) {
        throw new ApifyRunError(
          `Apify run ${runId} did not finish within ${this.maxPollMs}ms`,
          runId,
          status,
        )
      }
      await sleep(this.pollIntervalMs)
    }
  }

  private async fetchItems(datasetId: string): Promise<ApifyPlaceResult[]> {
    const response = await this.fetchImpl(
      `${APIFY_API_BASE}/datasets/${datasetId}/items?${this.tokenParam()}&format=json`,
    )
    if (!response.ok) {
      throw new ApifyRunError(`Apify dataset fetch failed with HTTP ${response.status}`)
    }
    const raw = (await response.json()) as unknown
    if (!Array.isArray(raw)) {
      throw new ApifyRunError('Apify dataset response was not an array')
    }
    return raw
      .map((item) => normalizeApifyItem(item as RawApifyItem))
      .filter((item): item is ApifyPlaceResult => item !== null)
  }
}
