import type { CostRecorder, FetchLike } from './types'

/**
 * Resend adapter — used for warm replies from the inbox (never cold outreach;
 * that is Smartlead's job) and for parsing inbound reply webhooks.
 */

export type ResendSendInput = {
  from: string
  to: string
  subject: string
  text: string
  html?: string
  headers?: Record<string, string>
}

export interface ResendMailer {
  send(input: ResendSendInput): Promise<{ providerId: string }>
}

/** Raised for non-2xx Resend responses; status carries the HTTP code. */
export class ResendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ResendError'
  }
}

/** Records every send with deterministic ids (re-msg-1, re-msg-2, …). */
export class FixtureResendMailer implements ResendMailer {
  readonly sends: ResendSendInput[] = []
  private seq = 0

  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async send(input: ResendSendInput): Promise<{ providerId: string }> {
    this.sends.push(input)
    this.options.recordCost?.({
      category: 'email',
      provider: 'resend-fixture',
      units: 1,
      amountMicroGbp: 0, // within Resend's free tier at inbox-reply volume
      ref: input.to,
    })
    return { providerId: `re-msg-${++this.seq}` }
  }
}

export type RealResendMailerOptions = {
  apiKey: string
  /** Injectable for tests — adapter tests must never hit the network. */
  fetchImpl?: FetchLike
  recordCost?: CostRecorder
}

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

export class RealResendMailer implements ResendMailer {
  private readonly fetchImpl: FetchLike

  constructor(private readonly options: RealResendMailerOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async send(input: ResendSendInput): Promise<{ providerId: string }> {
    const response = await this.fetchImpl(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      }),
    })
    if (!response.ok) {
      throw new ResendError(`Resend send failed (HTTP ${response.status})`, response.status)
    }
    const body = (await response.json()) as { id?: string }
    if (typeof body.id !== 'string') {
      throw new ResendError('Resend response missing message id', response.status)
    }
    this.options.recordCost?.({
      category: 'email',
      provider: 'resend',
      units: 1,
      amountMicroGbp: 0, // within Resend's free tier at inbox-reply volume
      ref: input.to,
    })
    return { providerId: body.id }
  }
}

// ── inbound parsing ─────────────────────────────────────────────────────────

export type ResendInboundEmail = {
  /** The `prospect-{uuid}` plus-token from the to-address, when present. */
  toPlusToken: string | null
  from: string
  subject: string
  text: string
  html?: string
}

const PLUS_TOKEN =
  /^[^@+\s]+\+(prospect-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i

const asAddress = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (typeof value === 'object' && value !== null) {
    const email = (value as Record<string, unknown>).email
    if (typeof email === 'string' && email.trim().length > 0) return email.trim()
  }
  return null
}

/**
 * Normalize a Resend inbound-email webhook payload. Pure and tolerant: the
 * envelope may or may not be wrapped in {type, data}; `to` may be a string or
 * an array. Returns null when the payload is not an inbound email at all —
 * the route 200s so Resend stops retrying.
 */
export function parseResendInbound(payload: unknown): ResendInboundEmail | null {
  if (typeof payload !== 'object' || payload === null) return null
  const outer = payload as Record<string, unknown>
  const data = (
    typeof outer.data === 'object' && outer.data !== null ? outer.data : outer
  ) as Record<string, unknown>

  const from = asAddress(data.from)
  const toRaw = data.to
  const toList = (Array.isArray(toRaw) ? toRaw : [toRaw])
    .map(asAddress)
    .filter((addr): addr is string => addr !== null)
  if (!from || toList.length === 0) return null

  let toPlusToken: string | null = null
  for (const addr of toList) {
    const match = PLUS_TOKEN.exec(addr)
    if (match) {
      toPlusToken = match[1]!.toLowerCase()
      break
    }
  }

  const result: ResendInboundEmail = {
    toPlusToken,
    from,
    subject: typeof data.subject === 'string' ? data.subject : '',
    text: typeof data.text === 'string' ? data.text : '',
  }
  if (typeof data.html === 'string') result.html = data.html
  return result
}
