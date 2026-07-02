import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FetchLike } from './types'

/**
 * Stripe adapter — subscription checkout for site claims, the billing portal,
 * and webhook verification/parsing for the three events the platform consumes.
 * Raw fetch against the REST API (form-encoded), no Stripe SDK.
 */

export type StripeCheckoutInput = {
  customerEmail: string
  monthlyPriceId: string
  setupPriceId?: string
  setupWaiverCouponId?: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}

export type StripeSubscriptionSnapshot = {
  status: string
  priceId: string | null
  currentPeriodEnd: Date | null
  canceledAt: Date | null
  stripeCustomerId: string
}

/**
 * The narrow event union the platform consumes. Signature-valid events of any
 * other type map to `ignored` so routes can 200 without Stripe retrying.
 */
export type StripeWebhookEvent =
  | {
      type: 'checkout.session.completed'
      session: {
        id: string
        customer: string | null
        subscription: string | null
        metadata: Record<string, string>
      }
    }
  | {
      type: 'customer.subscription.updated' | 'customer.subscription.deleted'
      subscription: {
        id: string
        customer: string
        status: string
        priceId: string | null
        currentPeriodEnd: Date | null
        canceledAt: Date | null
      }
    }
  | { type: 'ignored'; raw: string }

export interface StripeClient {
  createCheckoutSession(input: StripeCheckoutInput): Promise<{ sessionId: string; url: string }>
  createBillingPortalSession(input: {
    stripeCustomerId: string
    returnUrl: string
  }): Promise<{ url: string }>
  /** null = reject (bad/missing signature, expired timestamp, or unparseable body). */
  verifyWebhook(rawBody: string, signatureHeader: string | null): StripeWebhookEvent | null
  getSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSnapshot>
}

/** Raised for non-2xx Stripe responses; status carries the HTTP code, body the raw text. */
export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string = '',
  ) {
    super(message)
    this.name = 'StripeError'
  }
}

// ── event parsing (shared by fixture and real) ──────────────────────────────

/** Stripe references like `customer` arrive as an id string or an expanded object. */
const asIdOrNull = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'object' && value !== null) {
    const id = (value as Record<string, unknown>).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

const asStringRecord = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null) return {}
  const record: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') record[key] = entry
  }
  return record
}

const unixToDate = (value: unknown): Date | null =>
  typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null

/** `items.data[0].price.id` from a raw subscription object, when present. */
const firstItemPriceId = (raw: Record<string, unknown>): string | null => {
  const items = raw.items
  if (typeof items !== 'object' || items === null) return null
  const data = (items as Record<string, unknown>).data
  if (!Array.isArray(data)) return null
  const first: unknown = data[0]
  if (typeof first !== 'object' || first === null) return null
  return asIdOrNull((first as Record<string, unknown>).price)
}

type StripeSubscriptionEventBody = Extract<
  StripeWebhookEvent,
  { type: 'customer.subscription.updated' | 'customer.subscription.deleted' }
>['subscription']

const mapSubscriptionObject = (
  raw: Record<string, unknown>,
): StripeSubscriptionEventBody | null => {
  const id = typeof raw.id === 'string' ? raw.id : null
  const customer = asIdOrNull(raw.customer)
  const status = typeof raw.status === 'string' ? raw.status : null
  if (!id || !customer || !status) return null
  return {
    id,
    customer,
    status,
    priceId: firstItemPriceId(raw),
    currentPeriodEnd: unixToDate(raw.current_period_end),
    canceledAt: unixToDate(raw.canceled_at),
  }
}

/**
 * Parse a raw Stripe event body (`{type, data: {object}}`) into the union.
 * Signature verification is the caller's job — this only shapes the payload.
 * Malformed JSON or consumed event types missing required fields → null.
 */
export function parseStripeEvent(rawBody: string): StripeWebhookEvent | null {
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const event = payload as Record<string, unknown>
  const type = event.type
  if (typeof type !== 'string') return null
  const data = event.data
  const object =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>).object : undefined

  if (type === 'checkout.session.completed') {
    if (typeof object !== 'object' || object === null) return null
    const session = object as Record<string, unknown>
    if (typeof session.id !== 'string') return null
    return {
      type,
      session: {
        id: session.id,
        customer: asIdOrNull(session.customer),
        subscription: asIdOrNull(session.subscription),
        metadata: asStringRecord(session.metadata),
      },
    }
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    if (typeof object !== 'object' || object === null) return null
    const subscription = mapSubscriptionObject(object as Record<string, unknown>)
    if (!subscription) return null
    return { type, subscription }
  }

  return { type: 'ignored', raw: rawBody }
}

// ── fixture ─────────────────────────────────────────────────────────────────

/**
 * Offline Stripe with deterministic ids (cs_fixture-1, sub_fixture-1,
 * cus_fixture-1, …) and no clocks or randomness. `createCheckoutSession`
 * returns the successUrl as the checkout url so the offline claim flow lands
 * straight on the success page. `verifyWebhook` is STATELESS — it ignores the
 * signature and just parses the body — so an out-of-process e2e test can POST
 * a synthetic event without sharing this instance's memory.
 */
export class FixtureStripeClient implements StripeClient {
  readonly sessions = new Map<string, StripeCheckoutInput>()
  readonly subscriptions = new Map<string, StripeSubscriptionSnapshot>()
  private sessionSeq = 0
  private subscriptionSeq = 0
  private customerSeq = 0

  async createCheckoutSession(
    input: StripeCheckoutInput,
  ): Promise<{ sessionId: string; url: string }> {
    const sessionId = `cs_fixture-${++this.sessionSeq}`
    this.sessions.set(sessionId, input)
    return { sessionId, url: input.successUrl }
  }

  async createBillingPortalSession(input: {
    stripeCustomerId: string
    returnUrl: string
  }): Promise<{ url: string }> {
    return { url: input.returnUrl }
  }

  verifyWebhook(rawBody: string, _signatureHeader: string | null): StripeWebhookEvent | null {
    return parseStripeEvent(rawBody)
  }

  async getSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSnapshot> {
    return (
      this.subscriptions.get(stripeSubscriptionId) ?? {
        status: 'active',
        priceId: null,
        currentPeriodEnd: null,
        canceledAt: null,
        stripeCustomerId: 'cus_fixture-1',
      }
    )
  }

  /** Store a subscription for getSubscription; tests drive the lifecycle with it. */
  recordSubscription(snapshot: Partial<StripeSubscriptionSnapshot> = {}): {
    subscriptionId: string
    stripeCustomerId: string
  } {
    const subscriptionId = `sub_fixture-${++this.subscriptionSeq}`
    const stripeCustomerId = snapshot.stripeCustomerId ?? `cus_fixture-${++this.customerSeq}`
    this.subscriptions.set(subscriptionId, {
      status: snapshot.status ?? 'active',
      priceId: snapshot.priceId ?? null,
      currentPeriodEnd: snapshot.currentPeriodEnd ?? null,
      canceledAt: snapshot.canceledAt ?? null,
      stripeCustomerId,
    })
    return { subscriptionId, stripeCustomerId }
  }
}

// ── real ────────────────────────────────────────────────────────────────────

export type RealStripeClientOptions = {
  apiKey: string
  /** Signing secret (whsec_…) — required before verifyWebhook may be called. */
  webhookSecret?: string
  /** Injectable for tests — adapter tests must never hit the network. */
  fetchImpl?: FetchLike
}

const STRIPE_BASE_URL = 'https://api.stripe.com/v1'
const WEBHOOK_TOLERANCE_SECONDS = 300

/**
 * Thin form-encoded client over POST /checkout/sessions, POST
 * /billing_portal/sessions and GET /subscriptions/{id}, plus Stripe-Signature
 * verification (HMAC-SHA256 over `${t}.${rawBody}`, 300s tolerance).
 */
export class RealStripeClient implements StripeClient {
  private readonly fetchImpl: FetchLike

  constructor(private readonly options: RealStripeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    form?: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${STRIPE_BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(form ? { body: form.toString() } : {}),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new StripeError(
        `Stripe request failed (HTTP ${response.status}) — ${method} ${path}`,
        response.status,
        body,
      )
    }
    return (await response.json()) as Record<string, unknown>
  }

  async createCheckoutSession(
    input: StripeCheckoutInput,
  ): Promise<{ sessionId: string; url: string }> {
    const form = new URLSearchParams()
    form.set('mode', 'subscription')
    form.set('customer_email', input.customerEmail)
    form.set('success_url', input.successUrl)
    form.set('cancel_url', input.cancelUrl)
    form.set('line_items[0][price]', input.monthlyPriceId)
    form.set('line_items[0][quantity]', '1')
    if (input.setupPriceId) {
      form.set('line_items[1][price]', input.setupPriceId)
      form.set('line_items[1][quantity]', '1')
    }
    if (input.setupWaiverCouponId) form.set('discounts[0][coupon]', input.setupWaiverCouponId)
    for (const [key, value] of Object.entries(input.metadata)) {
      form.set(`metadata[${key}]`, value)
      // mirrored onto the subscription so its webhooks carry the same context
      form.set(`subscription_data[metadata][${key}]`, value)
    }
    const body = await this.request('POST', '/checkout/sessions', form)
    if (typeof body.id !== 'string' || typeof body.url !== 'string') {
      throw new StripeError('Stripe checkout-session response missing id or url', 502)
    }
    return { sessionId: body.id, url: body.url }
  }

  async createBillingPortalSession(input: {
    stripeCustomerId: string
    returnUrl: string
  }): Promise<{ url: string }> {
    const form = new URLSearchParams()
    form.set('customer', input.stripeCustomerId)
    form.set('return_url', input.returnUrl)
    const body = await this.request('POST', '/billing_portal/sessions', form)
    if (typeof body.url !== 'string') {
      throw new StripeError('Stripe billing-portal response missing url', 502)
    }
    return { url: body.url }
  }

  /**
   * Stripe scheme: header `t=<unix>,v1=<hex>[,v1=…]`, signed payload
   * `${t}.${rawBody}`, HMAC-SHA256 with the whsec_ secret used verbatim.
   * Any v1 candidate may match (secret rolls produce several). Missing
   * webhookSecret is a misconfiguration and throws — never verify blind.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): StripeWebhookEvent | null {
    const secret = this.options.webhookSecret
    if (!secret) {
      throw new StripeError(
        'RealStripeClient.verifyWebhook requires webhookSecret (set STRIPE_WEBHOOK_SECRET)',
        500,
      )
    }
    if (!signatureHeader) return null

    let timestampRaw: string | null = null
    const candidates: string[] = []
    for (const part of signatureHeader.split(',')) {
      const equals = part.indexOf('=')
      if (equals === -1) continue
      const key = part.slice(0, equals).trim()
      const value = part.slice(equals + 1).trim()
      if (key === 't' && value.length > 0) timestampRaw = value
      if (key === 'v1' && value.length > 0) candidates.push(value)
    }
    if (timestampRaw === null || candidates.length === 0) return null
    const timestamp = Number(timestampRaw)
    if (!Number.isFinite(timestamp)) return null
    if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return null

    const expected = createHmac('sha256', secret).update(`${timestampRaw}.${rawBody}`).digest()
    const matched = candidates.some((candidate) => {
      const given = Buffer.from(candidate, 'hex')
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
    return matched ? parseStripeEvent(rawBody) : null
  }

  async getSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSnapshot> {
    const body = await this.request('GET', `/subscriptions/${stripeSubscriptionId}`)
    const mapped = mapSubscriptionObject(body)
    if (!mapped) {
      throw new StripeError('Stripe subscription response missing id, customer or status', 502)
    }
    return {
      status: mapped.status,
      priceId: mapped.priceId,
      currentPeriodEnd: mapped.currentPeriodEnd,
      canceledAt: mapped.canceledAt,
      stripeCustomerId: mapped.customer,
    }
  }
}

// ── resolver ────────────────────────────────────────────────────────────────

/** Real Stripe only when a key is present — every other environment stays offline. */
export function resolveStripe(env: NodeJS.ProcessEnv = process.env): StripeClient {
  if (env.STRIPE_SECRET_KEY) {
    return new RealStripeClient({
      apiKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    })
  }
  return new FixtureStripeClient()
}
