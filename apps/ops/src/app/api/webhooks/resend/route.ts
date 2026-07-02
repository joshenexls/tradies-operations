import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { parseResendInbound } from '@tradies/integrations'
import { getDb } from '@/lib/db'
import { handleInboundEmail } from '@/server/core/inbound-mail'

export const dynamic = 'force-dynamic'

/**
 * Resend inbound-email webhook (bypasses Basic auth via the middleware).
 *
 * Auth: svix-style signature over `{svix-id}.{svix-timestamp}.{raw body}`
 * with the whsec_ base64 secret, verified when RESEND_WEBHOOK_SECRET is set
 * (copy the signing secret from the Resend webhook settings). Without it
 * (local dev) the route accepts unauthenticated posts, loudly.
 *
 * Configure in Resend: an inbound domain whose replies address prospects as
 * replies+prospect-{prospectId}@<inbound-domain>, and a webhook for the
 * email.received event pointed at https://<ops-host>/api/webhooks/resend.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const id = request.headers.get('svix-id')
    const timestamp = request.headers.get('svix-timestamp')
    const signature = request.headers.get('svix-signature')
    if (!id || !timestamp || !signature || !verifySvix(secret, id, timestamp, signature, raw)) {
      return NextResponse.json({ error: 'invalid webhook signature' }, { status: 401 })
    }
  } else {
    console.warn(
      '[webhooks/resend] RESEND_WEBHOOK_SECRET unset — accepting unauthenticated webhook (dev only)',
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const email = parseResendInbound(payload)
  if (!email) return NextResponse.json({ ok: true, ignored: true })

  const result = await handleInboundEmail(getDb(), email, { rawJson: raw })
  return NextResponse.json({ ok: true, ...result })
}

/** Svix scheme: HMAC-SHA256(base64secret, `${id}.${ts}.${body}`), any v1 match wins. */
function verifySvix(
  secret: string,
  id: string,
  timestamp: string,
  signatureHeader: string,
  body: string,
): boolean {
  let key: Buffer
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  } catch {
    return false
  }
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  return signatureHeader.split(/\s+/).some((part) => {
    const [version, sig] = part.split(',', 2)
    if (version !== 'v1' || !sig) return false
    try {
      const given = Buffer.from(sig, 'base64')
      return given.length === expected.length && timingSafeEqual(given, expected)
    } catch {
      return false
    }
  })
}
