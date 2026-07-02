'use client'

import { useState } from 'react'

/**
 * Plain HTML form POST to the checkout route (which 303s to Stripe) — no
 * fetch, so the redirect chain works identically with and without JS.
 */
export function ClaimForm({
  token,
  defaults,
}: {
  token: string
  defaults: { businessName: string; email: string; phone: string; serviceAreas: string }
}) {
  const [submitting, setSubmitting] = useState(false)

  const field =
    'mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none'
  const label = 'block text-sm font-medium text-zinc-700'

  return (
    <form
      method="post"
      action={`/api/stripe/checkout?token=${encodeURIComponent(token)}`}
      className="mt-6 space-y-4"
      onSubmit={() => setSubmitting(true)}
      data-testid="claim-form"
    >
      <div>
        <label className={label} htmlFor="cl-business">
          Business name
        </label>
        <input
          id="cl-business"
          name="businessName"
          required
          defaultValue={defaults.businessName}
          className={field}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="cl-name">
            Your name
          </label>
          <input id="cl-name" name="contactName" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="cl-phone">
            Phone
          </label>
          <input
            id="cl-phone"
            name="phone"
            type="tel"
            defaultValue={defaults.phone}
            className={field}
          />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="cl-email">
          Email (for your receipt and dashboard link)
        </label>
        <input
          id="cl-email"
          name="email"
          type="email"
          required
          defaultValue={defaults.email}
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="cl-areas">
          Areas you cover
        </label>
        <input
          id="cl-areas"
          name="serviceAreas"
          defaultValue={defaults.serviceAreas}
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="cl-notes">
          Anything we should change first? (optional)
        </label>
        <textarea id="cl-notes" name="notes" rows={2} className={field} />
      </div>
      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input type="checkbox" name="tosAccepted" required className="mt-0.5 accent-indigo-600" />
        <span>
          I agree to the terms of service, including monthly auto-renewal until cancelled.
        </span>
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {submitting ? 'Taking you to secure checkout…' : 'Continue to secure checkout'}
      </button>
    </form>
  )
}
