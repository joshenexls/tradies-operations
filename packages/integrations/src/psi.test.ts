import { getFixture } from '@tradies/fixtures'
import { describe, expect, it } from 'vitest'
import { FixturePsiClient, PsiError, RealPsiClient } from './psi'
import type { CostEntry, FetchLike } from './types'
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeFetchStub(response: Response) {
  const urls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url)
    return response
  }
  return { fetchImpl, urls }
}

describe('RealPsiClient', () => {
  it('maps the lighthouse result to a rounded score and https flag', async () => {
    const { fetchImpl, urls } = makeFetchStub(
      jsonResponse({
        lighthouseResult: {
          requestedUrl: 'http://swiftflowplumbing.example/',
          finalUrl: 'http://swiftflowplumbing.example/',
          categories: { performance: { score: 0.235 } },
        },
      }),
    )
    const client = new RealPsiClient({ fetchImpl })
    const result = await client.score('http://swiftflowplumbing.example')

    expect(result).toEqual({ performance: 24, https: false })
    const url = urls[0] ?? ''
    expect(url).toContain('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?')
    expect(url).toContain(`url=${encodeURIComponent('http://swiftflowplumbing.example')}`)
    expect(url).toContain('category=performance')
    expect(url).toContain('strategy=mobile')
    expect(url).not.toContain('key=')
  })

  it('detects https from the final url and appends the api key when given', async () => {
    const { fetchImpl, urls } = makeFetchStub(
      jsonResponse({
        lighthouseResult: {
          requestedUrl: 'http://brunelbuild.example/',
          finalUrl: 'https://brunelbuild.example/',
          categories: { performance: { score: 0.91 } },
        },
      }),
    )
    const client = new RealPsiClient({ apiKey: 'psi-key', fetchImpl })
    const result = await client.score('http://brunelbuild.example')
    expect(result).toEqual({ performance: 91, https: true })
    expect(urls[0]).toContain('key=psi-key')
  })

  it('throws a typed PsiError when the performance category is missing', async () => {
    const { fetchImpl } = makeFetchStub(jsonResponse({ lighthouseResult: { categories: {} } }))
    const client = new RealPsiClient({ fetchImpl })
    await expect(client.score('http://x.example')).rejects.toBeInstanceOf(PsiError)
  })

  it('throws a typed PsiError with the status on HTTP failure', async () => {
    const { fetchImpl } = makeFetchStub(jsonResponse({ error: 'quota' }, 429))
    const client = new RealPsiClient({ fetchImpl })
    const promise = client.score('http://x.example')
    await expect(promise).rejects.toBeInstanceOf(PsiError)
    await expect(promise).rejects.toMatchObject({ status: 429 })
  })

  it('records a zero-cost psi entry per call', async () => {
    const entries: CostEntry[] = []
    const { fetchImpl } = makeFetchStub(
      jsonResponse({
        lighthouseResult: {
          finalUrl: 'https://x.example/',
          categories: { performance: { score: 0.5 } },
        },
      }),
    )
    const client = new RealPsiClient({ fetchImpl, recordCost: (e) => entries.push(e) })
    await client.score('https://x.example')
    expect(entries).toEqual([
      {
        category: 'psi',
        provider: 'pagespeed',
        units: 1,
        amountMicroGbp: 0,
        ref: 'https://x.example',
      },
    ])
  })
})
