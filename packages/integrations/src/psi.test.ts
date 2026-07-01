import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import { FixturePsiClient } from './psi'
import type { CostEntry } from './types'
import { NotFoundError } from './types'

describe('FixturePsiClient', () => {
  it('scores a bad site low and without https', async () => {
    const client = new FixturePsiClient()
    const fixture = getFixture('stockport-heating-mellor')
    const result = await client.score(fixture.websiteUrl as string)
    expect(result).toEqual(fixture.psi)
    expect(result.https).toBe(false)
    expect(result.performance).toBeLessThan(50)
  })

  it('scores a fine site high and with https', async () => {
    const client = new FixturePsiClient()
    const result = await client.score(getFixture('bristol-builder-brunel').websiteUrl as string)
    expect(result.https).toBe(true)
    expect(result.performance).toBeGreaterThanOrEqual(80)
  })

  it('throws a typed NotFoundError for unknown urls', async () => {
    const client = new FixturePsiClient()
    await expect(client.score('http://unknown.example')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('records a psi entry per score call', async () => {
    const entries: CostEntry[] = []
    const client = new FixturePsiClient({ recordCost: (e) => entries.push(e) })
    await client.score(getFixture('harrogate-heating-spa').websiteUrl as string)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.category).toBe('psi')
    expect(entries[0]?.units).toBe(1)
  })
})
