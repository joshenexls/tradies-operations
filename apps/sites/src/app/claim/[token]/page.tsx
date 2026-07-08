import type { Metadata } from 'next'
import { getDb } from '@/lib/db'
import { stripeConfig } from '@/lib/stripe'
import { loadClaimContext } from '@/server/core/claim'
import { ClaimForm } from './claim-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Claim your website',
  robots: { index: false, follow: false },
}

const OPERATOR_NAME = process.env.OPERATOR_BRAND_NAME ?? 'Tradies Studio'

/**
 * The conversion page behind every preview banner's "Claim this website".
 * Four states; only 'claimable' shows the confirmation form + price block.
 */
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
  const context = await loadClaimContext(getDb(), token)
  const config = stripeConfig()

  if (context.state === 'unknown') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Link not recognised</h1>
        <p className="mt-2 text-zinc-600">
          This claim link isn&apos;t valid. If you received it from us, reply to our email and
          we&apos;ll send a fresh one.
        </p>
      </Shell>
    )
  }
  if (context.state === 'expired') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This preview has expired</h1>
        <p className="mt-2 text-zinc-600">
          Reply to our email and we&apos;ll refresh your website and reactivate the link.
        </p>
      </Shell>
    )
  }
  if (context.state === 'already-claimed') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Already claimed</h1>
        <p className="mt-2 text-zinc-600">
          This website has already been claimed. Check your email for your dashboard link, or
          contact us if you need it re-sent.
        </p>
      </Shell>
    )
  }

  const { prospect, site } = context
  const profile = prospect.extractedProfile

  return (
    <Shell>
      <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">{OPERATOR_NAME}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Make {prospect.businessName ?? 'your website'} official
      </h1>
      <p className="mt-2 text-zinc-600">
        Confirm your details below and your website goes live within minutes — including the AI
        assistant, the leads inbox and ongoing edits.
      </p>

      <div
        className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5"
        data-testid="price-block"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Website, assistant &amp; leads inbox</span>
          <span className="text-xl font-semibold">{config.priceMonthlyDisplay}/month</span>
        </div>
        {config.setupFeePromoEnabled ? (
          <div className="mt-2 flex items-baseline justify-between text-sm">
            <span className="text-zinc-500">One-off setup</span>
            <span>
              <s className="text-zinc-400">{config.priceSetupDisplay}</s>{' '}
              <span className="font-medium text-emerald-700">
                Waived — code {config.setupWaiverCodeDisplay} applied at checkout
              </span>
            </span>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-zinc-500">
          Cancel any time from your dashboard. Payments handled securely by Stripe.
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <ClaimForm
        token={token}
        defaults={{
          businessName: prospect.businessName ?? '',
          email: profile?.email?.value ?? '',
          phone: profile?.phone?.value ?? prospect.phone ?? '',
          serviceAreas: (profile?.serviceAreas ?? []).join(', '),
        }}
      />
      <p className="mt-6 text-xs text-zinc-400">
        Preview: <span className="font-mono">{site.slug}</span> · Questions? Just reply to our
        email.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl px-6 py-16 font-sans text-zinc-900">{children}</main>
}
