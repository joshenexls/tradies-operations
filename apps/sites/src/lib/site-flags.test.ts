import { describe, expect, it } from 'vitest'
import { SiteFlagsCache } from './site-flags'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('SiteFlagsCache', () => {
  it('caches within the TTL and refreshes after it', async () => {
    let calls = 0
    let now = 0
    const cache = new SiteFlagsCache({
      ttlMs: 1000,
      now: () => now,
      fetchImpl: async () => {
        calls++
        return jsonResponse({ status: 'live', noindex: false })
      },
    })
    expect(await cache.get('a', 'http://x')).toEqual({ status: 'live', noindex: false })
    expect(await cache.get('a', 'http://x')).toEqual({ status: 'live', noindex: false })
    expect(calls).toBe(1)
    now = 1001
    await cache.get('a', 'http://x')
    expect(calls).toBe(2)
  })

  it('fails CLOSED: network errors, 404s and bad payloads all return null (and are cached)', async () => {
    let mode: 'throw' | '404' | 'garbage' = 'throw'
    const cache = new SiteFlagsCache({
      ttlMs: 1000,
      now: () => 0,
      fetchImpl: async () => {
        if (mode === 'throw') throw new Error('boom')
        if (mode === '404') return jsonResponse({ error: 'unknown' }, 404)
        return jsonResponse({ status: 42 })
      },
    })
    expect(await cache.get('down', 'http://x')).toBeNull()
    mode = '404'
    expect(await cache.get('missing', 'http://x')).toBeNull()
    mode = 'garbage'
    expect(await cache.get('weird', 'http://x')).toBeNull()
    // negative result is cached too — one bad lookup doesn't hammer the route
    mode = 'throw'
    expect(await cache.get('missing', 'http://x')).toBeNull()
  })
})
