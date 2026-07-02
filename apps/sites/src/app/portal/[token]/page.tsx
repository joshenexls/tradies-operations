import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ChatRateLimiter } from '@/lib/chat'
import { getDb } from '@/lib/db'
import { tenantOrigin } from '@/lib/stripe'
import { openBillingPortal } from '@/server/actions/portal'
import { loadPortal } from '@/server/core/portal'
import {
  ChangesSection,
  LeadsSection,
  SettingsSection,
  type PortalEditRequest,
  type PortalLead,
} from './portal-sections'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your website dashboard',
  robots: { index: false, follow: false },
}

/**
 * The customer dashboard behind the portal token from the welcome email.
 * Token lookups are rate limited per IP (and per guessed token) so the token
 * space cannot be scanned; unknown tokens get one generic answer.
 */
const lookupLimiter = new ChatRateLimiter({ perSession: 60, perSite: 2000, windowMs: 60_000 })

const SITE_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  claimed: { label: 'Getting ready', className: 'bg-sky-100 text-sky-800' },
  live: { label: 'Live', className: 'bg-emerald-100 text-emerald-800' },
  disabled: { label: 'Offline', className: 'bg-amber-100 text-amber-800' },
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const requestHeaders = await headers()
  const ip =
    requestHeaders.get('cf-connecting-ip') ??
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null

  // consume before the lookup — once an IP (or token) burns its budget, the
  // remaining guesses in the window never reach the database
  if (!lookupLimiter.allow({ siteId: 'portal-lookup', sessionId: token, ip })) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Too many attempts</h1>
        <p className="mt-2 text-zinc-600">Please wait a minute and reload this page.</p>
      </Shell>
    )
  }

  const portal = await loadPortal(getDb(), token)
  if (!portal) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Link not recognised</h1>
        <p className="mt-2 text-zinc-600">
          This dashboard link isn&apos;t valid. Check the link in your welcome email, or reply to it
          and we&apos;ll send a fresh one.
        </p>
      </Shell>
    )
  }

  const { site, prospect, customer, subscription } = portal

  if (site.status === 'preview' || site.status === 'expired') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This website hasn&apos;t been claimed yet</h1>
        <p className="mt-2 text-zinc-600">
          The dashboard unlocks once the website is claimed and checkout is complete.
        </p>
        {site.claimToken ? (
          <a
            href={`/claim/${site.claimToken}`}
            className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Claim this website
          </a>
        ) : null}
      </Shell>
    )
  }

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const siteUrl = tenantOrigin(`${proto}://${host}`, site.slug)
  const badge = SITE_STATUS_BADGES[site.status] ?? {
    label: site.status,
    className: 'bg-zinc-100 text-zinc-600',
  }

  const leads: PortalLead[] = portal.leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    message: lead.message,
    source: lead.source,
    createdLabel: dateFormat.format(lead.createdAt),
    alerted: lead.notifiedAt !== null,
    handled: lead.actionedAt !== null,
  }))
  const editRequests: PortalEditRequest[] = portal.editRequests.map((request) => ({
    id: request.id,
    body: request.body,
    status: request.status,
    createdLabel: dateFormat.format(request.createdAt),
  }))

  return (
    <Shell>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">
            Your website dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {prospect.businessName ?? site.slug}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <a
            href={siteUrl}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            target="_blank"
            rel="noreferrer"
          >
            View your site ↗
          </a>
        </div>
      </header>

      {site.status === 'disabled' ? (
        <p
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
          role="alert"
        >
          There&apos;s a billing issue — your site is offline. Manage billing below.
        </p>
      ) : null}

      <LeadsSection token={token} leads={leads} />
      <ChangesSection token={token} requests={editRequests} />
      <SettingsSection
        token={token}
        chatbotEnabled={site.chatbotEnabled}
        leadAlertEmail={customer?.leadAlertEmail ?? ''}
        hasCustomer={customer !== null}
      />

      {customer?.stripeCustomerId ? (
        <section
          className="mt-8 rounded-xl border border-zinc-200 bg-white p-5"
          aria-labelledby="portal-billing-heading"
        >
          <h2 id="portal-billing-heading" className="text-base font-semibold text-zinc-900">
            Billing
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {subscription
              ? `Subscription ${subscription.status}${
                  subscription.currentPeriodEnd
                    ? ` · renews ${dateFormat.format(subscription.currentPeriodEnd)}`
                    : ''
                }. Update your card or cancel any time.`
              : 'Update your card or cancel any time.'}
          </p>
          <form action={openBillingPortal.bind(null, token)} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Manage billing
            </button>
          </form>
        </section>
      ) : null}

      <p className="mt-8 text-xs text-zinc-400">
        Keep this link private — anyone with it can manage your website. Questions? Just reply to
        our email.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-12 font-sans text-zinc-900">{children}</main>
}
