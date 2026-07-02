import type { Trade } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import {
  APIFY_COST_PER_PLACE_MICRO_GBP,
  ApifyRunError,
  categoryToTrade,
  FixtureApifyClient,
  RealApifyClient,
} from './apify'
import type { CostEntry, FetchLike } from './types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('categoryToTrade', () => {
  const cases: [string | undefined, Trade][] = [
    ['Plumber', 'plumber'],
    ['Plumbing service', 'plumber'],
    ['Electrician', 'electrician'],
    ['Electrical installation service', 'electrician'],
    ['Roofing contractor', 'roofer'],
    ['Roofer', 'roofer'],
    ['Builder', 'builder'],
    ['Construction company', 'builder'],
    ['Heating contractor', 'heating'],
    ['Gas installation service', 'heating'],
    ['Boiler supplier', 'heating'],
    ['HVAC contractor', 'heating'],
    ['Locksmith', 'other'],
    ['', 'other'],
    [undefined, 'other'],
  ]

  it.each(cases)('maps %j to %s', (categoryName, expected) => {
    expect(categoryToTrade(categoryName)).toBe(expected)
  })

  it('round-trips every fixture trade label', () => {
    // FixtureApifyClient derives categoryName from TRADE_LABELS; the mapping
    // must take it back to the originating trade.
    expect(categoryToTrade('Plumbing')).toBe('plumber')
    expect(categoryToTrade('Electrical')).toBe('electrician')
    expect(categoryToTrade('Roofing')).toBe('roofer')
    expect(categoryToTrade('Building')).toBe('builder')
    expect(categoryToTrade('Heating & Gas')).toBe('heating')
    expect(categoryToTrade('Trade services')).toBe('other')
  })
})

describe('FixtureApifyClient', () => {
  it('returns Leeds plumber fixtures shaped like Apify items', async () => {
    const client = new FixtureApifyClient()
    const { runId, items } = await client.runGoogleMapsSearch({
      city: 'Leeds',
      trade: 'plumber',
      maxPlaces: 20,
    })
    expect(runId).toBe('fixture-run-Leeds-plumber')
    expect(items.length).toBeGreaterThan(0)
    const swift = items.find((i) => i.placeId === 'fx-place-leeds-plumber-swift')
    expect(swift).toBeDefined()
    expect(swift?.title).toBe('Swift Flow Plumbing')
    expect(swift?.categoryName).toBe('Plumbing')
    expect(swift?.phone).toBe('0113 496 0721')
    expect(swift?.website).toBe('http://swiftflowplumbing.example')
    expect(swift?.address).toBe('14 Otley Road, Leeds')
    expect(swift?.postcode).toBe('LS6 3AA')
  })

  it('matches the city case-insensitively and respects maxPlaces', async () => {
    const client = new FixtureApifyClient()
    const { items } = await client.runGoogleMapsSearch({
      city: 'leeds',
      trade: 'plumber',
      maxPlaces: 1,
    })
    expect(items).toHaveLength(1)
  })

  it('records one places cost row per returned item', async () => {
    const entries: CostEntry[] = []
    const client = new FixtureApifyClient({ recordCost: (e) => entries.push(e) })
    const { runId, items } = await client.runGoogleMapsSearch({
      city: 'Leeds',
      trade: 'plumber',
      maxPlaces: 20,
    })
    expect(entries).toHaveLength(items.length)
    for (const entry of entries) {
      expect(entry.category).toBe('places')
      expect(entry.provider).toBe('apify-fixture')
      expect(entry.units).toBe(1)
      expect(entry.amountMicroGbp).toBe(APIFY_COST_PER_PLACE_MICRO_GBP)
      expect(entry.ref).toBe(runId)
    }
  })
})

/** Realistic Apify dataset payload including the postCode + phoneUnformatted variants. */
const datasetItems = [
  {
    placeId: 'ChIJreal-1',
    title: 'Swift Flow Plumbing',
    categoryName: 'Plumber',
    address: '14 Otley Road, Leeds',
    postCode: 'LS6 3AA',
    city: 'Leeds',
    phoneUnformatted: '+441134960721',
    website: 'http://swiftflowplumbing.example',
    totalScore: 4.7,
    url: 'https://www.google.com/maps/place/?q=place_id:ChIJreal-1',
  },
  {
    placeId: 'ChIJreal-2',
    title: 'Aire Plumbers',
    categoryName: 'Plumbing service',
    postalCode: 'LS5 3EH',
    phone: '0113 496 0999',
  },
  { title: 'No PlaceId Plumbing' },
  { placeId: 'ChIJno-title' },
]

function makeApifyFetchStub(runStatuses: string[]) {
  const requests: { url: string; init?: RequestInit }[] = []
  let poll = 0
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, ...(init ? { init } : {}) })
    if (url.includes('/acts/')) {
      return jsonResponse({ data: { id: 'run-123', defaultDatasetId: 'ds-456' } })
    }
    if (url.includes('/actor-runs/run-123')) {
      const status = runStatuses[Math.min(poll, runStatuses.length - 1)]
      poll += 1
      return jsonResponse({ data: { status } })
    }
    if (url.includes('/datasets/ds-456/items')) {
      return jsonResponse(datasetItems)
    }
    throw new Error(`unexpected url in stub: ${url}`)
  }
  return { fetchImpl, requests }
}

describe('RealApifyClient', () => {
  it('starts a run, polls to success and normalizes the dataset items', async () => {
    const { fetchImpl, requests } = makeApifyFetchStub(['RUNNING', 'RUNNING', 'SUCCEEDED'])
    const entries: CostEntry[] = []
    const client = new RealApifyClient({
      token: 'apify-token',
      fetchImpl,
      pollIntervalMs: 1,
      maxPollMs: 1_000,
      recordCost: (e) => entries.push(e),
    })

    const { runId, items } = await client.runGoogleMapsSearch({
      city: 'Leeds',
      trade: 'plumber',
      maxPlaces: 30,
    })

    expect(runId).toBe('run-123')

    // Start request shape
    const start = requests[0]
    expect(start?.url).toBe(
      'https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=apify-token',
    )
    expect(start?.init?.method).toBe('POST')
    const startBody = JSON.parse(String(start?.init?.body)) as Record<string, unknown>
    expect(startBody).toEqual({
      searchStringsArray: ['Plumbing Leeds'],
      maxCrawledPlacesPerSearch: 30,
      language: 'en',
      countryCode: 'gb',
    })

    // Polled until SUCCEEDED, then fetched the dataset
    const pollUrls = requests.filter((r) => r.url.includes('/actor-runs/'))
    expect(pollUrls.length).toBe(3)
    expect(requests.at(-1)?.url).toContain('/datasets/ds-456/items?token=apify-token&format=json')

    // Items normalized; entries without placeId or title skipped
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      placeId: 'ChIJreal-1',
      title: 'Swift Flow Plumbing',
      categoryName: 'Plumber',
      address: '14 Otley Road, Leeds',
      postcode: 'LS6 3AA',
      city: 'Leeds',
      phone: '+441134960721',
      website: 'http://swiftflowplumbing.example',
      totalScore: 4.7,
      url: 'https://www.google.com/maps/place/?q=place_id:ChIJreal-1',
    })
    expect(items[1]).toEqual({
      placeId: 'ChIJreal-2',
      title: 'Aire Plumbers',
      categoryName: 'Plumbing service',
      postcode: 'LS5 3EH',
      phone: '0113 496 0999',
    })

    // One cost row per returned item
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      expect(entry).toEqual({
        category: 'places',
        provider: 'apify',
        units: 1,
        amountMicroGbp: APIFY_COST_PER_PLACE_MICRO_GBP,
        ref: 'run-123',
      })
    }
  })

  it('throws a typed ApifyRunError when the run fails', async () => {
    const { fetchImpl } = makeApifyFetchStub(['RUNNING', 'FAILED'])
    const client = new RealApifyClient({
      token: 'apify-token',
      fetchImpl,
      pollIntervalMs: 1,
      maxPollMs: 1_000,
    })
    const promise = client.runGoogleMapsSearch({ city: 'Leeds', trade: 'plumber', maxPlaces: 5 })
    await expect(promise).rejects.toBeInstanceOf(ApifyRunError)
    await expect(promise).rejects.toMatchObject({ runId: 'run-123', runStatus: 'FAILED' })
  })

  it('gives up after maxPollMs with a typed error', async () => {
    const { fetchImpl } = makeApifyFetchStub(['RUNNING'])
    const client = new RealApifyClient({
      token: 'apify-token',
      fetchImpl,
      pollIntervalMs: 1,
      maxPollMs: 5,
    })
    await expect(
      client.runGoogleMapsSearch({ city: 'Leeds', trade: 'plumber', maxPlaces: 5 }),
    ).rejects.toBeInstanceOf(ApifyRunError)
  })

  it('respects a custom per-place cost', async () => {
    const { fetchImpl } = makeApifyFetchStub(['SUCCEEDED'])
    const entries: CostEntry[] = []
    const client = new RealApifyClient({
      token: 'apify-token',
      fetchImpl,
      pollIntervalMs: 1,
      costPerPlaceMicroGbp: 9_999,
      recordCost: (e) => entries.push(e),
    })
    await client.runGoogleMapsSearch({ city: 'Leeds', trade: 'plumber', maxPlaces: 5 })
    expect(entries[0]?.amountMicroGbp).toBe(9_999)
  })
})
