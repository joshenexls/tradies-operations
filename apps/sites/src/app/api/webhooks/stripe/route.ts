import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { resolveMailer } from '@/lib/mailer'
import { resolveStripe } from '@/lib/stripe'
import { handleStripeEvent } from '@/server/core/stripe-webhook'

export const dynamic = 'force-dynamic'

/**
 * Stripe webhook endpoint — RAW body first (signatures are over the exact
 * bytes), then verify, then delegate. Bad signature → 400; everything the
 * platform doesn't consume → 200 so Stripe never retries forever.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const event = resolveStripe().verifyWebhook(rawBody, request.headers.get('stripe-signature'))
  if (!event) return NextResponse.json({ error: 'invalid signature' }, { status: 400 })

  const outcome = await handleStripeEvent(getDb(), resolveMailer(), event, {
    requestOrigin: request.nextUrl.origin,
  })
  return NextResponse.json({ ok: true, ...outcome })
}
