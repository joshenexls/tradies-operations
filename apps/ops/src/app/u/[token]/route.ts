import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { prospects } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { prospectIdFromToken } from '@/lib/unsubscribe'
import { suppressProspect } from '@/server/core/suppress'

export const dynamic = 'force-dynamic'

/**
 * One-click unsubscribe (public by design — the middleware exempts /u/*).
 * The token is HMAC-signed, so a valid GET is proof the recipient followed
 * their own footer link; it suppresses every identifier we hold for them
 * (email, domain, phone, place id) across every channel.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const prospectId = prospectIdFromToken(token)
  const db = getDb()
  const [prospect] = prospectId
    ? await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
    : []
  if (!prospect) {
    return htmlResponse(400, 'Invalid link', 'This unsubscribe link is not valid.')
  }

  // idempotent: re-clicking a footer link must not duplicate permission events
  if (!prospect.suppressedAt) {
    await suppressProspect(db, prospect, {
      reason: 'unsubscribe',
      sourceChannel: 'unsubscribe_link',
      includePhone: true,
      includePlaceId: true,
    })
  }

  return htmlResponse(200, 'Unsubscribed', "You've been unsubscribed — we won't contact you again.")
}

function htmlResponse(status: number, title: string, message: string): NextResponse {
  const body = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #fafafa; color: #18181b">
    <main style="max-width: 28rem; padding: 2rem; text-align: center">
      <h1 style="font-size: 1.125rem">${title}</h1>
      <p style="color: #52525b">${message}</p>
    </main>
  </body>
</html>`
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
