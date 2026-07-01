/**
 * GDPR Article 14 transparency notice (data NOT collected from the subject —
 * ours comes from public listings and registers) and the legitimate interests
 * assessment template. Art 14 requires the notice within one month of
 * collection or at first contact, whichever is sooner.
 */

export type Art14NoticeInput = {
  controllerName: string
  contactEmail: string
  /** Human-readable data sources, e.g. 'Companies House', 'Google Business Profile'. */
  sources: string[]
}

export function buildArt14Notice(input: Art14NoticeInput): string {
  const sourceList = input.sources.map((source) => `- ${source}`).join('\n')
  return `# How we got your details and what we do with them

## Who we are

${input.controllerName} is the data controller for the information described below. You can
reach us about anything on this page at ${input.contactEmail}.

## What we hold and why

We hold business contact details — business name, trading address, publicly listed phone
number and email address, and public company records. We use them for one purpose: to tell
trade businesses about our website service (business-to-business direct marketing) and, if
you become a customer, to provide that service.

## Our lawful basis

Legitimate interests (UK GDPR Article 6(1)(f)): contacting businesses about a service
relevant to their trade. We have completed a legitimate interests assessment covering the
purpose, necessity and balancing tests, and we only email corporate subscribers as PECR
requires. A copy of the assessment is available on request.

## Where your data came from

${sourceList}

## How long we keep it

If you don't respond, we delete your details within 12 months of our last contact. If you
opt out, we keep the minimum needed on our suppression list so we never contact you again.
If you become a customer, we keep your details for the life of the service plus the period
required for tax and accounting records.

## Your rights

- Object to direct marketing at any time — we stop immediately, no questions asked
- Ask for a copy of what we hold (access), correction (rectification) or deletion (erasure)
- Restrict how we use your data while a complaint is resolved
- Exercise any of these by emailing ${input.contactEmail}

## Complaints

If you're unhappy with how we've handled your data, you can complain to the Information
Commissioner's Office (ICO) at ico.org.uk or on 0303 123 1113 — though we'd welcome the
chance to put it right first at ${input.contactEmail}.
`
}

/**
 * Three-part legitimate interests test skeleton (ICO format). Complete before
 * the first send, keep the completed copy, and re-run when processing changes.
 */
export const LIA_TEMPLATE = `# Legitimate Interests Assessment — B2B direct marketing

Complete before the first send. Keep the finished copy: the ICO expects to see it on
request. Re-run whenever the data, audience or message materially changes.

## Part 1 — Purpose test: is there a legitimate interest?

- What are we trying to achieve? …
- Who benefits from the processing, and how? …
- Would the businesses contacted reasonably expect a pitch of this kind? …
- What would the impact be if we couldn't do this? …

## Part 2 — Necessity test: is the processing necessary?

- Does contacting this audience actually further the purpose above? …
- Is there a less intrusive way to achieve the same result? …
- Why is the data held (business name and business contact details) the minimum needed? …

## Part 3 — Balancing test: do the recipients' interests override ours?

- Nature of the data: business contact details from public sources; no special category
  data. …
- Reasonable expectations: sourced from public business listings — would the recipient
  expect contact from a relevant supplier? …
- Likely impact: a small number of clearly identified, relevant messages. …
- Safeguards: corporate-subscriber gate (PECR reg 22), global suppression list honoured on
  every channel, one-click opt-out in every message, Article 14 notice within one month of
  collection, TPS screening before any call. …

## Outcome

- Decision (proceed / proceed with extra safeguards / stop): …
- Completed by: …  Date: …  Review date: …
`
