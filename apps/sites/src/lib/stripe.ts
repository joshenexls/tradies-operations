import { resolveStripe } from '@tradies/integrations'

export { resolveStripe }

/**
 * Pricing display + Stripe object ids, all env-driven so the setup-fee
 * mechanic (displayed but always waived — solicitor-review item) can be
 * reconfigured or killed without a deploy. Fixture ids keep offline
 * environments running with no Stripe account.
 */
export type StripeConfig = {
  monthlyPriceId: string
  setupPriceId: string
  setupWaiverCouponId: string
  priceMonthlyDisplay: string
  priceSetupDisplay: string
  setupWaiverCodeDisplay: string
  /** SETUP_FEE_PROMO kill switch — when off, no setup fee is shown or charged. */
  setupFeePromoEnabled: boolean
}

export function stripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  return {
    monthlyPriceId: env.STRIPE_PRICE_MONTHLY ?? 'price_fixture_monthly',
    setupPriceId: env.STRIPE_PRICE_SETUP ?? 'price_fixture_setup',
    setupWaiverCouponId: env.STRIPE_COUPON_SETUP_WAIVER ?? 'coupon_fixture_waiver',
    priceMonthlyDisplay: env.PRICE_MONTHLY_DISPLAY ?? '£19.99',
    priceSetupDisplay: env.PRICE_SETUP_DISPLAY ?? '£149.99',
    setupWaiverCodeDisplay: env.SETUP_WAIVER_CODE_DISPLAY ?? 'WELCOME',
    setupFeePromoEnabled: (env.SETUP_FEE_PROMO ?? '1') !== '0',
  }
}

/** Tenant origin for a slug, derived from the current request origin. */
export function tenantOrigin(requestOrigin: string, slug: string): string {
  const url = new URL(requestOrigin)
  const baseHost = process.env.PREVIEW_BASE_HOST ?? 'localhost'
  const port = url.port ? `:${url.port}` : ''
  return `${url.protocol}//${slug}.${baseHost}${port}`
}
