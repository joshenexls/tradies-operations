import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { sites } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { tenantOrigin } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Payment received',
  robots: { index: false, follow: false },
}

/**
 * Stripe's success_url. The webhook flips the site live moments after payment
 * — until it lands we show a self-refreshing "finalising" state. Rendering
 * the portal link here is safe: this page is only reachable after checkout,
 * and the link only shows once payment has actually been confirmed (live).
 */
export default async function ClaimSuccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = getDb()
  const [site] = await db.select().from(sites).where(eq(sites.claimToken, token)).limit(1)
  if (!site) notFound()

  if (site.status !== 'live' && site.status !== 'claimed') {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 font-sans text-zinc-900">
        {/* re-check every few seconds until the webhook lands */}
        <meta httpEquiv="refresh" content="3" />
        <h1 className="text-2xl font-semibold tracking-tight">Finalising your payment…</h1>
        <p className="mt-2 text-zinc-600" data-testid="finalising">
          This usually takes a few seconds. This page will refresh automatically.
        </p>
      </main>
    )
  }

  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const origin = tenantOrigin(`${proto}://${host}`, site.slug)
  return (
    <main className="mx-auto max-w-xl px-6 py-16 font-sans text-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight">🎉 Your website is live</h1>
      <p className="mt-2 text-zinc-600">
        Search engines can now find it, the demo label is gone, and every lead lands in your inbox.
      </p>
      <div className="mt-6 space-y-3">
        <a
          href={origin}
          className="block rounded-md bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-700"
          data-testid="site-link"
        >
          View your website
        </a>
        <a
          href={`/portal/${site.portalToken}`}
          className="block rounded-md border border-zinc-300 px-4 py-2.5 text-center text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          data-testid="portal-link"
        >
          Open your dashboard
        </a>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        We&apos;ve emailed you the dashboard link too — keep it private.
      </p>
    </main>
  )
}
