'use client'

import { useState, useTransition } from 'react'
import { markLeadHandled, requestEdit, savePortalSettings } from '@/server/actions/portal'

/**
 * The portal's interactive sections. Data arrives pre-serialised from the
 * server page; every mutation goes through a server action which revalidates
 * the portal path, so the lists below re-render from the database.
 */

const sectionClass = 'mt-8 rounded-xl border border-zinc-200 bg-white p-5'
const headingClass = 'text-base font-semibold text-zinc-900'
const buttonClass =
  'rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60'

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </p>
  )
}

// ── leads ───────────────────────────────────────────────────────────────────

export type PortalLead = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  message: string | null
  source: 'chatbot' | 'form'
  createdLabel: string
  alerted: boolean
  handled: boolean
}

export function LeadsSection({ token, leads }: { token: string; leads: PortalLead[] }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function markHandled(leadId: string) {
    startTransition(async () => {
      const result = await markLeadHandled(token, leadId)
      setError('error' in result ? result.error : null)
    })
  }

  return (
    <section className={sectionClass} aria-labelledby="portal-leads-heading">
      <h2 id="portal-leads-heading" className={headingClass}>
        Leads
      </h2>
      {leads.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          No leads yet — enquiries from your website form and chat assistant will appear here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className={`flex items-start justify-between gap-4 py-3 ${lead.handled ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">
                  {lead.name ?? 'Website visitor'}
                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">
                    {lead.source === 'chatbot' ? 'chat assistant' : 'contact form'}
                  </span>
                  {lead.alerted ? (
                    <span
                      data-testid="lead-alerted"
                      className="ml-2 text-xs font-normal text-emerald-700"
                    >
                      alerted ✓
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600">
                  {[lead.phone, lead.email].filter(Boolean).join(' · ') || 'No contact details'}
                </p>
                {lead.message ? <p className="mt-1 text-sm text-zinc-600">{lead.message}</p> : null}
                <p className="mt-1 text-xs text-zinc-400">{lead.createdLabel}</p>
              </div>
              {lead.handled ? (
                <span className="shrink-0 text-xs text-zinc-500">Handled ✓</span>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => markHandled(lead.id)}
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Mark handled
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote message={error} />
    </section>
  )
}

// ── changes ─────────────────────────────────────────────────────────────────

export type PortalEditRequest = {
  id: string
  body: string | null
  status: 'new' | 'in_progress' | 'done' | 'declined'
  createdLabel: string
}

const EDIT_STATUS_BADGES: Record<
  PortalEditRequest['status'],
  { label: string; className: string }
> = {
  new: { label: 'New', className: 'bg-sky-100 text-sky-800' },
  in_progress: { label: 'In progress', className: 'bg-amber-100 text-amber-800' },
  done: { label: 'Done', className: 'bg-emerald-100 text-emerald-800' },
  declined: { label: 'Declined', className: 'bg-zinc-100 text-zinc-600' },
}

export function ChangesSection({
  token,
  requests,
}: {
  token: string
  requests: PortalEditRequest[]
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextBody = body
    startTransition(async () => {
      const result = await requestEdit(token, nextBody)
      if ('error' in result) {
        setError(result.error)
      } else {
        setBody('')
        setError(null)
      }
    })
  }

  return (
    <section className={sectionClass} aria-labelledby="portal-changes-heading">
      <h2 id="portal-changes-heading" className={headingClass}>
        Changes
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Tell us what to update on your website — we make the edits for you.
      </p>
      <form onSubmit={submit} className="mt-3">
        <label htmlFor="portal-edit-request" className="block text-sm font-medium text-zinc-700">
          Request a change
        </label>
        <textarea
          id="portal-edit-request"
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="e.g. Please update our opening hours to 8am–6pm."
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
        <button type="submit" disabled={isPending} className={`mt-2 ${buttonClass}`}>
          {isPending ? 'Sending…' : 'Request a change'}
        </button>
      </form>
      <ErrorNote message={error} />
      {requests.length > 0 ? (
        <ul className="mt-4 divide-y divide-zinc-100">
          {requests.map((request) => {
            const badge = EDIT_STATUS_BADGES[request.status]
            return (
              <li key={request.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-800">{request.body}</p>
                  <p className="mt-1 text-xs text-zinc-400">{request.createdLabel}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

// ── settings ────────────────────────────────────────────────────────────────

export function SettingsSection({
  token,
  chatbotEnabled,
  leadAlertEmail,
  hasCustomer,
}: {
  token: string
  chatbotEnabled: boolean
  leadAlertEmail: string
  hasCustomer: boolean
}) {
  const [email, setEmail] = useState(leadAlertEmail)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggleChatbot(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.checked
    startTransition(async () => {
      const result = await savePortalSettings(token, { chatbotEnabled: next })
      setError('error' in result ? result.error : null)
    })
  }

  function saveEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextEmail = email
    startTransition(async () => {
      const result = await savePortalSettings(token, { leadAlertEmail: nextEmail })
      setError('error' in result ? result.error : null)
      setSaved('ok' in result)
    })
  }

  return (
    <section className={sectionClass} aria-labelledby="portal-settings-heading">
      <h2 id="portal-settings-heading" className={headingClass}>
        Settings
      </h2>
      <div className="mt-3 flex items-start gap-2">
        <input
          id="portal-chatbot"
          type="checkbox"
          defaultChecked={chatbotEnabled}
          onChange={toggleChatbot}
          className="mt-0.5 accent-indigo-600"
        />
        <label htmlFor="portal-chatbot" className="text-sm text-zinc-700">
          <span className="font-medium">Chat assistant on your site</span>
          <span className="block text-xs text-zinc-500">
            Answers visitor questions and captures their details as leads.
          </span>
        </label>
      </div>
      {hasCustomer ? (
        <form onSubmit={saveEmail} className="mt-4">
          <label htmlFor="portal-alert-email" className="block text-sm font-medium text-zinc-700">
            Lead alert email
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="portal-alert-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setSaved(false)
              }}
              className="block w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            />
            <button type="submit" disabled={isPending} className={buttonClass}>
              {saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">New leads are emailed to this address.</p>
        </form>
      ) : null}
      <ErrorNote message={error} />
    </section>
  )
}
