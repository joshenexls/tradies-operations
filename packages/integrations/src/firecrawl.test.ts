import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import {
  FIRECRAWL_COST_PER_SCRAPE_MICRO_GBP,
  FirecrawlError,
  FixtureFirecrawlClient,
  RealFirecrawlClient,
} from './firecrawl'
import type { CostEntry, FetchLike } from './types'
import { NotFoundError } from './types'

describe('FixtureFirecrawlClient', () => {
  it('serves the fixture scrapeMarkdown for a known url', async () => {
    const client = new FixtureFirecrawlClient()
    const fixture = getFixture('leeds-plumber-swift')
    const result = await client.scrape(fixture.websiteUrl as string)
    expect(result.markdown).toBe(fixture.scrapeMarkdown)
    expect(result.markdown).toContain('We repair and service all makes of boiler')
    expect(result.screenshotRef).toBe('fx-screenshot-leeds-plumber-swift')
  })

  it('throws a typed NotFoundError for unknown urls', async () => {
    const client = new FixtureFirecrawlClient()
    await expect(client.scrape('http://unknown.example')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('records one firecrawl unit per scrape', async () => {
    const entries: CostEntry[] = []
    const client = new FixtureFirecrawlClient({ recordCost: (e) => entries.push(e) })
    await client.scrape(getFixture('york-heating-minster').websiteUrl as string)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.category).toBe('firecrawl')
    expect(entries[0]?.units).toBe(1)
    expect(entries[0]?.amountMicroGbp).toBeGreaterThan(0)
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeFetchStub(response: Response) {
  const requests: { url: string; init?: RequestInit }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, ...(init ? { init } : {}) })
    return response
  }
  return { fetchImpl, requests }
}

describe('RealFirecrawlClient', () => {
  it('scrapes markdown + screenshot url and sends the documented request shape', async () => {
    const { fetchImpl, requests } = makeFetchStub(
      jsonResponse({
        success: true,
        data: {
          markdown: '# Swift Flow Plumbing\n\nBoilers fixed.',
          screenshot: 'https://storage.firecrawl.dev/screenshots/abc.png',
        },
      }),
    )
    const client = new RealFirecrawlClient({ apiKey: 'fc-key', fetchImpl })
    const result = await client.scrape('http://swiftflowplumbing.example')

    expect(result.markdown).toContain('Swift Flow Plumbing')
    expect(result.screenshotRef).toBe('https://storage.firecrawl.dev/screenshots/abc.png')
    expect(result.screenshotBase64).toBeUndefined()

    const request = requests[0]
    expect(request?.url).toBe('https://api.firecrawl.dev/v2/scrape')
    expect(request?.init?.method).toBe('POST')
    const headers = request?.init?.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer fc-key')
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      url: 'http://swiftflowplumbing.example',
      formats: ['markdown', 'screenshot'],
    })
  })

  it('stores a data-uri screenshot as base64', async () => {
    const { fetchImpl } = makeFetchStub(
      jsonResponse({
        data: { markdown: '# Hi', screenshot: 'data:image/png;base64,aGVsbG8=' },
      }),
    )
    const client = new RealFirecrawlClient({ apiKey: 'fc-key', fetchImpl })
    const result = await client.scrape('http://x.example')
    expect(result.screenshotBase64).toBe('aGVsbG8=')
    expect(result.screenshotRef).toBeUndefined()
  })

  it.each([
    [402, /payment required/i],
    [429, /rate limited/i],
    [404, /failed/i],
    [500, /server error/i],
  ])('maps HTTP %d to a typed FirecrawlError', async (status, messagePattern) => {
    const { fetchImpl } = makeFetchStub(jsonResponse({ error: 'nope' }, status))
    const client = new RealFirecrawlClient({ apiKey: 'fc-key', fetchImpl })
    const promise = client.scrape('http://x.example')
    await expect(promise).rejects.toBeInstanceOf(FirecrawlError)
    await expect(promise).rejects.toMatchObject({ status })
    await expect(promise).rejects.toThrow(messagePattern)
  })

  it('records one firecrawl cost unit per successful scrape', async () => {
    const entries: CostEntry[] = []
    const { fetchImpl } = makeFetchStub(jsonResponse({ data: { markdown: '# Hi' } }))
    const client = new RealFirecrawlClient({
      apiKey: 'fc-key',
      fetchImpl,
      recordCost: (e) => entries.push(e),
    })
    await client.scrape('http://x.example')
    expect(entries).toEqual([
      {
        category: 'firecrawl',
        provider: 'firecrawl',
        units: 1,
        amountMicroGbp: FIRECRAWL_COST_PER_SCRAPE_MICRO_GBP,
        ref: 'http://x.example',
      },
    ])
  })

  it('does not record cost on failure', async () => {
    const entries: CostEntry[] = []
    const { fetchImpl } = makeFetchStub(jsonResponse({}, 429))
    const client = new RealFirecrawlClient({
      apiKey: 'fc-key',
      fetchImpl,
      recordCost: (e) => entries.push(e),
    })
    await expect(client.scrape('http://x.example')).rejects.toBeInstanceOf(FirecrawlError)
    expect(entries).toHaveLength(0)
  })
})
