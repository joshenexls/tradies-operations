'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { resolveStripe } from '@/lib/stripe'
import {
  createEditRequest,
  loadPortal,
  markLeadActioned,
  updatePortalSettings,
  type PortalActionResult,
} from '../core/portal'

/** Thin 'use server' wrappers — all decisions live in core/portal. */

function refresh(portalToken: string): void {
  revalidatePath(`/portal/${portalToken}`)
}

export async function requestEdit(portalToken: string, body: string): Promise<PortalActionResult> {
  const result = await createEditRequest(getDb(), { portalToken, body })
  if ('ok' in result) refresh(portalToken)
  return result
}

export async function markLeadHandled(
  portalToken: string,
  leadId: string,
): Promise<PortalActionResult> {
  const result = await markLeadActioned(getDb(), { portalToken, leadId })
  if ('ok' in result) refresh(portalToken)
  return result
}

export async function savePortalSettings(
  portalToken: string,
  input: { chatbotEnabled?: boolean; leadAlertEmail?: string },
): Promise<PortalActionResult> {
  const result = await updatePortalSettings(getDb(), { portalToken, ...input })
  if ('ok' in result) refresh(portalToken)
  return result
}

/**
 * Form action behind "Manage billing" — creates a Stripe billing-portal
 * session returning to this dashboard and redirects into it. The button only
 * renders when a stripeCustomerId exists; if that races, land back on the
 * portal page.
 */
export async function openBillingPortal(portalToken: string): Promise<void> {
  const portal = await loadPortal(getDb(), portalToken)
  const stripeCustomerId = portal?.customer?.stripeCustomerId
  if (!portal || !stripeCustomerId) redirect(`/portal/${encodeURIComponent(portalToken)}`)

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const returnUrl = `${proto}://${host}/portal/${encodeURIComponent(portalToken)}`

  const { url } = await resolveStripe().createBillingPortalSession({ stripeCustomerId, returnUrl })
  redirect(url)
}
