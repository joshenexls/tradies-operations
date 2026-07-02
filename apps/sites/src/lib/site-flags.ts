/**
 * Per-isolate cached lookup of a site's {status, noindex} for the middleware
 * noindex decision. FAIL-CLOSED by contract: any failure (network, 404, bad
 * payload) returns null and the caller keeps the noindex header — a preview
 * must never leak into search because a lookup hiccuped.
 *
 * Edge-safe: plain fetch + Map, no Node APIs (this runs in middleware).
 */

export type SiteFlags = { status: string; noindex: boolean }

type CacheEntry = { flags: SiteFlags | null; fetchedAt: number }

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>

export class SiteFlagsCache {
  private cache = new Map<string, CacheEntry>()

  constructor(
    private opts: { ttlMs: number; fetchImpl?: FetchLike; now?: () => number } = { ttlMs: 60_000 },
  ) {}

  /** null = unknown/failed → caller must keep noindex. */
  async get(slug: string, origin: string): Promise<SiteFlags | null> {
    const now = (this.opts.now ?? Date.now)()
    const cached = this.cache.get(slug)
    if (cached && now - cached.fetchedAt < this.opts.ttlMs) return cached.flags

    // opportunistic sweep so long-lived isolates don't grow unbounded
    if (this.cache.size > 10_000) {
      for (const [key, entry] of this.cache) {
        if (now - entry.fetchedAt >= this.opts.ttlMs) this.cache.delete(key)
      }
    }

    let flags: SiteFlags | null = null
    try {
      const fetchImpl = this.opts.fetchImpl ?? fetch
      const response = await fetchImpl(
        `${origin}/api/site-flags?slug=${encodeURIComponent(slug)}`,
        { signal: AbortSignal.timeout(2000) },
      )
      if (response.ok) {
        const data = (await response.json()) as Partial<SiteFlags>
        if (typeof data.status === 'string' && typeof data.noindex === 'boolean') {
          flags = { status: data.status, noindex: data.noindex }
        }
      }
    } catch {
      flags = null // fail closed
    }
    this.cache.set(slug, { flags, fetchedAt: now })
    return flags
  }
}

const globalForFlags = globalThis as unknown as { __tradiesSiteFlags?: SiteFlagsCache }

export function getSiteFlagsCache(): SiteFlagsCache {
  return (globalForFlags.__tradiesSiteFlags ??= new SiteFlagsCache({
    ttlMs: Number(process.env.SITE_FLAGS_CACHE_TTL_MS ?? 60_000),
  }))
}

/** True only when the site is verifiably live and index-allowed. */
export async function siteIsIndexable(slug: string, origin: string): Promise<boolean> {
  const flags = await getSiteFlagsCache().get(slug, origin)
  return flags !== null && flags.status === 'live' && flags.noindex === false
}
