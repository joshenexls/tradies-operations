import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { sites } from '@tradies/db/schema'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Internal lookup for the middleware noindex decision. Middleware cannot read
 * the DB (PGlite is single-process; Workers middleware has no binding), so it
 * self-fetches this route and caches per-isolate (lib/site-flags.ts). Returns
 * only non-sensitive flags.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'missing slug' }, { status: 400 })

  const db = getDb()
  const [site] = await db
    .select({ status: sites.status, noindex: sites.noindex })
    .from(sites)
    .where(eq(sites.slug, slug))
    .limit(1)
  if (!site) return NextResponse.json({ error: 'unknown slug' }, { status: 404 })

  return NextResponse.json(
    { status: site.status, noindex: site.noindex },
    // the middleware layer has its own TTL cache; never let a shared proxy cache this
    { headers: { 'cache-control': 'no-store' } },
  )
}
