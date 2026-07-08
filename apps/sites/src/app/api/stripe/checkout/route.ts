import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { resolveStripe, stripeConfig } from '@/lib/stripe'
import { startClaim } from '@/server/core/claim'

export const dynamic = 'force-dynamic'

/**
 * Claim form POST → record intent (customer 'pending_checkout') → Stripe
 * Checkout redirect. The setup-fee line item + its always-applied waiver
 * coupon only exist while SETUP_FEE_PROMO is on (solicitor-review item).
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  const form = await request.formData()
  const result = await startClaim(getDb(), {
    claimToken: token,
    form: {
      businessName: String(form.get('businessName') ?? '').trim(),
      contactName: String(form.get('contactName') ?? '').trim() || undefined,
      email: String(form.get('email') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim() || undefined,
      serviceAreas: String(form.get('serviceAreas') ?? '').trim() || undefined,
      notes: String(form.get('notes') ?? '').trim() || undefined,
      tosAccepted: form.get('tosAccepted') === 'on' ? (true as const) : (false as never),
    },
  })
  if ('error' in result) {
    const back = new URL(`/claim/${token}`, request.nextUrl.origin)
    back.searchParams.set('error', result.error)
    return NextResponse.redirect(back, 303)
  }

  const config = stripeConfig()
  const origin = request.nextUrl.origin
  const session = await resolveStripe().createCheckoutSession({
    customerEmail: String(form.get('email') ?? '').trim(),
    monthlyPriceId: config.monthlyPriceId,
    ...(config.setupFeePromoEnabled
      ? { setupPriceId: config.setupPriceId, setupWaiverCouponId: config.setupWaiverCouponId }
      : {}),
    successUrl: `${origin}/claim/${token}/success`,
    cancelUrl: `${origin}/claim/${token}`,
    metadata: {
      siteId: result.siteId,
      claimToken: token,
      customerId: result.customerId,
    },
  })

  return NextResponse.redirect(session.url, 303)
}
