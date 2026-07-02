import { NextResponse, type NextRequest } from 'next/server'
import { mapSmartleadWebhook } from '@tradies/integrations'
import { getDb } from '@/lib/db'
import { handleSmartleadEvent } from '@/server/core/outreach-webhooks'

export const dynamic = 'force-dynamic'

/**
 * Smartlead webhook receiver (bypasses Basic auth via the middleware).
 *
 * Auth: shared secret in the query string — Smartlead's webhook UI has no
 * request signing, so configure the webhook URL there as
 *   https://<ops-host>/api/webhooks/smartlead?secret=<SMARTLEAD_WEBHOOK_SECRET>
 * for the EMAIL_SENT / EMAIL_OPEN / EMAIL_CLICK / EMAIL_REPLY / EMAIL_BOUNCE /
 * LEAD_UNSUBSCRIBED events. Without the env set (local dev) the route accepts
 * unauthenticated posts, loudly.
 *
 * Always 200s for parseable payloads — Smartlead retries non-2xx forever, and
 * an unknown event type is not an error.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SMARTLEAD_WEBHOOK_SECRET
  if (secret) {
    if (request.nextUrl.searchParams.get('secret') !== secret) {
      return NextResponse.json({ error: 'invalid webhook secret' }, { status: 401 })
    }
  } else {
    console.warn(
      '[webhooks/smartlead] SMARTLEAD_WEBHOOK_SECRET unset — accepting unauthenticated webhook (dev only)',
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const event = mapSmartleadWebhook(payload)
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  const result = await handleSmartleadEvent(getDb(), event)
  return NextResponse.json({ ok: true, ...result })
}
