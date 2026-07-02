import { NextResponse, type NextRequest } from 'next/server'
import { siteIsIndexable } from '@/lib/site-flags'
import { extractTenantSlug } from '@/lib/tenancy'

/**
 * THE noindex choke point (plan compliance guardrail #7): every response served
 * on a tenant hostname carries X-Robots-Tag UNLESS the site is verifiably a
 * paying customer's live site. The check is DB-driven via a self-fetch to
 * /api/site-flags (middleware cannot read the DB directly) with a per-isolate
 * TTL cache, and FAIL-CLOSED: any lookup failure keeps the header. CI asserts
 * the header on previews and its absence on live sites.
 */

const PREVIEW_BASE_HOST = process.env.PREVIEW_BASE_HOST ?? 'localhost'

export async function middleware(request: NextRequest) {
  const slug = extractTenantSlug(request.headers.get('host'), {
    previewBaseHost: PREVIEW_BASE_HOST,
  })
  if (!slug) return NextResponse.next()

  const url = request.nextUrl.clone()
  // already-internal paths (assets, api) and the claim/portal flows pass
  // through un-rewritten — they are host-agnostic pages, not tenant content
  const isPassthrough =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/pool/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/embed/') ||
    url.pathname.startsWith('/claim/') ||
    url.pathname.startsWith('/portal/') ||
    url.pathname.startsWith('/privacy-notice')
  if (!isPassthrough) {
    url.pathname = `/s/${slug}${url.pathname === '/' ? '' : url.pathname}`
  }
  const response = isPassthrough ? NextResponse.next() : NextResponse.rewrite(url)

  // tenant DOCUMENT responses drop the header only for live, index-allowed
  // sites; passthrough surfaces (claim/portal/api) always stay out of indexes
  const indexable = isPassthrough ? false : await siteIsIndexable(slug, url.origin)
  if (!indexable) response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
