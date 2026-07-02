import { NextResponse, type NextRequest } from 'next/server'

/**
 * HTTP Basic auth for the whole ops desk (server actions POST to page URLs,
 * so they are covered too). The defaults exist so local dev and the e2e
 * suite work with zero setup — PRODUCTION MUST SET OPS_AUTH_USER and
 * OPS_AUTH_PASS (deploy checklist), the defaults are not a real credential.
 */

const AUTH_USER = process.env.OPS_AUTH_USER ?? 'ops'
const AUTH_PASS = process.env.OPS_AUTH_PASS ?? 'tradies-dev'

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ops"' },
  })
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Provider webhooks verify their own shared secrets/signatures, and the
  // one-click unsubscribe endpoint must be reachable by any recipient —
  // Basic auth would break both (PECR requires unsubscribe to actually work).
  if (pathname.startsWith('/api/webhooks/') || pathname.startsWith('/u/')) {
    return NextResponse.next()
  }

  const header = request.headers.get('authorization')
  if (!header?.startsWith('Basic ')) return unauthorized()
  let decoded: string
  try {
    decoded = atob(header.slice('Basic '.length))
  } catch {
    return unauthorized()
  }
  // password may contain ':' — only the first separator splits user from pass
  const colon = decoded.indexOf(':')
  const user = colon === -1 ? decoded : decoded.slice(0, colon)
  const pass = colon === -1 ? '' : decoded.slice(colon + 1)
  if (user !== AUTH_USER || pass !== AUTH_PASS) return unauthorized()
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
