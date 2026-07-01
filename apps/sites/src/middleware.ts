import { NextResponse, type NextRequest } from 'next/server'
import { extractTenantSlug } from '@/lib/tenancy'

/**
 * THE noindex choke point (plan compliance guardrail #7): every response served
 * on a tenant hostname carries X-Robots-Tag until a site is provisioned for a
 * paying customer (Phase 6 flips it per-site from the DB; in Phase 1 every
 * tenant is a preview, so it is unconditional here). CI asserts this header.
 * Preview-visit logging also belongs here eventually — it needs an edge-safe
 * store (Phase 4, Workers + Supabase); PGlite cannot run in middleware, so
 * Phase 1 logs visits in the page instead.
 */

const PREVIEW_BASE_HOST = process.env.PREVIEW_BASE_HOST ?? 'localhost'

export function middleware(request: NextRequest) {
  const slug = extractTenantSlug(request.headers.get('host'), {
    previewBaseHost: PREVIEW_BASE_HOST,
  })
  if (!slug) return NextResponse.next()

  const url = request.nextUrl.clone()
  // already-internal paths (assets, api) pass through but keep the header
  const isInternal =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/pool/') ||
    url.pathname.startsWith('/_next/')
  if (!isInternal) {
    url.pathname = `/s/${slug}${url.pathname === '/' ? '' : url.pathname}`
  }
  const response = isInternal ? NextResponse.next() : NextResponse.rewrite(url)
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
