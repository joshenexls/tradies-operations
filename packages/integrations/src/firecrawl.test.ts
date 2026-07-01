import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import { FixtureFirecrawlClient } from './firecrawl'
import type { CostEntry } from './types'
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
