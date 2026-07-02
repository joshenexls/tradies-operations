import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  FixtureStripeClient,
  RealStripeClient,
  StripeError,
  parseStripeEvent,
  resolveStripe,
} from './stripe'
import type { FetchLike } from './types'

// ── inline raw-event fixtures (Stripe's real envelope shape) ────────────────

const checkoutCompletedRaw = JSON.stringify({
  id: 'evt_1PxCheckout',
  object: 'event',
  api_version: '2025-03-31.basil',
  created: 1750000000,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_a1b2c3',
      object: 'checkout.session',
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_QAbCdE',
      customer_email: 'sam@swiftflowplumbing.example',
      subscription: 'sub_1QWxYz',
      metadata: { prospectId: 'prospect-123', plan: 'standard' },
      success_url: 'https://swiftflow.example/claim/success',
      cancel_url: 'https://swiftflow.example/claim',
    },
  },
})

const subscriptionRaw = (type: string, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'evt_1PxSub',
    object: 'event',
    type,
    data: {
      object: {
        id: 'sub_1QWxYz',
        object: 'subscription',
        customer: 'cus_QAbCdE',
        status: 'active',
        current_period_end: 1752600000,
        canceled_at: null,
        cancel_at_period_end: false,
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              object: 'subscription_item',
              price: { id: 'price_monthly_123', object: 'price' },
            },
          ],
        },
        metadata: { prospectId: 'prospect-123' },
        ...overrides,
      },
    },
  })

describe('FixtureStripeClient', () => {
  it('records checkout sessions with deterministic ids and returns the successUrl', async () => {
    const client = new FixtureStripeClient()
    const input = {
      customerEmail: 'sam@swiftflowplumbing.example',
      monthlyPriceId: 'price_monthly_123',
      successUrl: 'https://swiftflow.example/claim/success',
      cancelUrl: 'https://swiftflow.example/claim',
      metadata: { prospectId: 'prospect-123' },
    }
    const first = await client.createCheckoutSession(input)
    const second = await client.createCheckoutSession(input)
    expect(first).toEqual({ sessionId: 'cs_fixture-1', url: input.successUrl })
    expect(second.sessionId).toBe('cs_fixture-2')
    expect(client.sessions.get('cs_fixture-1')).toEqual(input)
  })

  it('returns the returnUrl from the billing portal', async () => {
    const client = new FixtureStripeClient()
    await expect(
      client.createBillingPortalSession({
        stripeCustomerId: 'cus_fixture-1',
        returnUrl: 'https://swiftflow.example/account',
      }),
    ).resolves.toEqual({ url: 'https://swiftflow.example/account' })
  })

  it('verifies webhooks statelessly: parses checkout.session.completed ignoring the signature', () => {
    const client = new FixtureStripeClient()
    expect(client.verifyWebhook(checkoutCompletedRaw, null)).toEqual({
      type: 'checkout.session.completed',
      session: {
        id: 'cs_test_a1b2c3',
        customer: 'cus_QAbCdE',
        subscription: 'sub_1QWxYz',
        metadata: { prospectId: 'prospect-123', plan: 'standard' },
      },
    })
  })

  it('parses subscription.updated and .deleted with unix→Date mapping', () => {
    const client = new FixtureStripeClient()
    expect(client.verifyWebhook(subscriptionRaw('customer.subscription.updated'), null)).toEqual({
      type: 'customer.subscription.updated',
      subscription: {
        id: 'sub_1QWxYz',
        customer: 'cus_QAbCdE',
        status: 'active',
        priceId: 'price_monthly_123',
        currentPeriodEnd: new Date(1752600000 * 1000),
        canceledAt: null,
      },
    })
    expect(
      client.verifyWebhook(
        subscriptionRaw('customer.subscription.deleted', {
          status: 'canceled',
          canceled_at: 1752000000,
        }),
        null,
      ),
    ).toEqual({
      type: 'customer.subscription.deleted',
      subscription: {
        id: 'sub_1QWxYz',
        customer: 'cus_QAbCdE',
        status: 'canceled',
        priceId: 'price_monthly_123',
        currentPeriodEnd: new Date(1752600000 * 1000),
        canceledAt: new Date(1752000000 * 1000),
      },
    })
  })

  it('maps unknown event types to ignored and malformed payloads to null', () => {
    const client = new FixtureStripeClient()
    const raw = JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'in_1' } } })
    expect(client.verifyWebhook(raw, null)).toEqual({ type: 'ignored', raw })
    expect(client.verifyWebhook('{not json', null)).toBeNull()
    expect(client.verifyWebhook('"just a string"', null)).toBeNull()
    expect(client.verifyWebhook(JSON.stringify({ data: {} }), null)).toBeNull()
    // consumed type but required fields missing → null, not ignored
    expect(
      client.verifyWebhook(JSON.stringify({ type: 'checkout.session.completed', data: {} }), null),
    ).toBeNull()
  })

  it('returns recorded subscriptions from getSubscription, else an active default', async () => {
    const client = new FixtureStripeClient()
    await expect(client.getSubscription('sub_unknown')).resolves.toEqual({
      status: 'active',
      priceId: null,
      currentPeriodEnd: null,
      canceledAt: null,
      stripeCustomerId: 'cus_fixture-1',
    })

    const recorded = client.recordSubscription({
      status: 'past_due',
      priceId: 'price_monthly_123',
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    })
    expect(recorded).toEqual({ subscriptionId: 'sub_fixture-1', stripeCustomerId: 'cus_fixture-1' })
    await expect(client.getSubscription('sub_fixture-1')).resolves.toEqual({
      status: 'past_due',
      priceId: 'price_monthly_123',
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
      canceledAt: null,
      stripeCustomerId: 'cus_fixture-1',
    })
  })
})

// ── real client, stub fetch ─────────────────────────────────────────────────

function makeFetchStub(responses: Response[]) {
  const calls: {
    url: string
    method: string
    headers: Record<string, string>
    body: string
  }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ''),
    })
    const response = responses.shift()
    if (!response) throw new Error('fetch stub exhausted')
    return response
  }
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('RealStripeClient', () => {
  it('creates a checkout session with the documented form-encoded body', async () => {
    const { fetchImpl, calls } = makeFetchStub([
      json({ id: 'cs_test_9z8y', url: 'https://checkout.stripe.com/c/pay/cs_test_9z8y' }),
    ])
    const client = new RealStripeClient({ apiKey: 'sk_test_key', fetchImpl })
    const result = await client.createCheckoutSession({
      customerEmail: 'sam@swiftflowplumbing.example',
      monthlyPriceId: 'price_monthly_123',
      setupPriceId: 'price_setup_456',
      setupWaiverCouponId: 'coupon_waiver_789',
      successUrl: 'https://swiftflow.example/claim/success',
      cancelUrl: 'https://swiftflow.example/claim',
      metadata: { prospectId: 'prospect-123', plan: 'standard' },
    })
    expect(result).toEqual({
      sessionId: 'cs_test_9z8y',
      url: 'https://checkout.stripe.com/c/pay/cs_test_9z8y',
    })

    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.headers.authorization).toBe('Bearer sk_test_key')
    expect(calls[0]?.headers['content-type']).toBe('application/x-www-form-urlencoded')

    const params = new URLSearchParams(calls[0]?.body)
    expect(Object.fromEntries(params)).toEqual({
      mode: 'subscription',
      customer_email: 'sam@swiftflowplumbing.example',
      success_url: 'https://swiftflow.example/claim/success',
      cancel_url: 'https://swiftflow.example/claim',
      'line_items[0][price]': 'price_monthly_123',
      'line_items[0][quantity]': '1',
      'line_items[1][price]': 'price_setup_456',
      'line_items[1][quantity]': '1',
      'discounts[0][coupon]': 'coupon_waiver_789',
      'metadata[prospectId]': 'prospect-123',
      'metadata[plan]': 'standard',
      // mirrored so subscription webhooks carry the same context
      'subscription_data[metadata][prospectId]': 'prospect-123',
      'subscription_data[metadata][plan]': 'standard',
    })
  })

  it('omits the setup line item and discount when not provided', async () => {
    const { fetchImpl, calls } = makeFetchStub([json({ id: 'cs_1', url: 'https://s.example' })])
    const client = new RealStripeClient({ apiKey: 'sk_test_key', fetchImpl })
    await client.createCheckoutSession({
      customerEmail: 'sam@swiftflowplumbing.example',
      monthlyPriceId: 'price_monthly_123',
      successUrl: 'https://swiftflow.example/claim/success',
      cancelUrl: 'https://swiftflow.example/claim',
      metadata: {},
    })
    const params = new URLSearchParams(calls[0]?.body)
    expect(params.has('line_items[1][price]')).toBe(false)
    expect(params.has('discounts[0][coupon]')).toBe(false)
  })

  it('throws a typed StripeError with the status and body on non-2xx', async () => {
    const { fetchImpl } = makeFetchStub([
      json({ error: { message: 'No such price' } }, 400),
      json({ error: { message: 'No such price' } }, 400),
    ])
    const client = new RealStripeClient({ apiKey: 'sk_test_key', fetchImpl })
    const attempt = () =>
      client.createCheckoutSession({
        customerEmail: 'sam@swiftflowplumbing.example',
        monthlyPriceId: 'price_missing',
        successUrl: 'https://s.example',
        cancelUrl: 'https://c.example',
        metadata: {},
      })
    await expect(attempt()).rejects.toBeInstanceOf(StripeError)
    await expect(attempt()).rejects.toMatchObject({
      status: 400,
      body: JSON.stringify({ error: { message: 'No such price' } }),
    })
  })

  it('creates a billing portal session', async () => {
    const { fetchImpl, calls } = makeFetchStub([
      json({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/bps_1' }),
    ])
    const client = new RealStripeClient({ apiKey: 'sk_test_key', fetchImpl })
    const result = await client.createBillingPortalSession({
      stripeCustomerId: 'cus_QAbCdE',
      returnUrl: 'https://swiftflow.example/account',
    })
    expect(result).toEqual({ url: 'https://billing.stripe.com/p/session/bps_1' })
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/billing_portal/sessions')
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      customer: 'cus_QAbCdE',
      return_url: 'https://swiftflow.example/account',
    })
  })

  it('gets a subscription and maps unix seconds, price id and customer', async () => {
    const { fetchImpl, calls } = makeFetchStub([
      json({
        id: 'sub_1QWxYz',
        object: 'subscription',
        customer: 'cus_QAbCdE',
        status: 'canceled',
        current_period_end: 1752600000,
        canceled_at: 1752000000,
        items: { object: 'list', data: [{ price: { id: 'price_monthly_123' } }] },
      }),
    ])
    const client = new RealStripeClient({ apiKey: 'sk_test_key', fetchImpl })
    await expect(client.getSubscription('sub_1QWxYz')).resolves.toEqual({
      status: 'canceled',
      priceId: 'price_monthly_123',
      currentPeriodEnd: new Date(1752600000 * 1000),
      canceledAt: new Date(1752000000 * 1000),
      stripeCustomerId: 'cus_QAbCdE',
    })
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/subscriptions/sub_1QWxYz')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.headers.authorization).toBe('Bearer sk_test_key')
    expect(calls[0]?.body).toBe('')
  })
})

describe('RealStripeClient.verifyWebhook', () => {
  const secret = 'whsec_test_secret'
  const client = () => new RealStripeClient({ apiKey: 'sk_test_key', webhookSecret: secret })
  const sign = (body: string, timestamp: number, signingSecret = secret) =>
    `t=${timestamp},v1=${createHmac('sha256', signingSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`
  const now = () => Math.floor(Date.now() / 1000)

  it('accepts a valid signature and parses the event', () => {
    const event = client().verifyWebhook(checkoutCompletedRaw, sign(checkoutCompletedRaw, now()))
    expect(event?.type).toBe('checkout.session.completed')
    if (event?.type !== 'checkout.session.completed') throw new Error('unreachable')
    expect(event.session.metadata.prospectId).toBe('prospect-123')
  })

  it('checks every v1 candidate (secret rolls send several)', () => {
    const timestamp = now()
    const stale = sign(checkoutCompletedRaw, timestamp, 'whsec_old_secret').split(',')[1]
    const good = sign(checkoutCompletedRaw, timestamp)
    const header = `t=${timestamp},${stale},${good.split(',')[1]}`
    expect(client().verifyWebhook(checkoutCompletedRaw, header)?.type).toBe(
      'checkout.session.completed',
    )
  })

  it('rejects a tampered body', () => {
    const header = sign(checkoutCompletedRaw, now())
    const tampered = checkoutCompletedRaw.replace('prospect-123', 'prospect-666')
    expect(client().verifyWebhook(tampered, header)).toBeNull()
  })

  it('rejects timestamps outside the 300s tolerance', () => {
    const expired = sign(checkoutCompletedRaw, now() - 301)
    expect(client().verifyWebhook(checkoutCompletedRaw, expired)).toBeNull()
    const future = sign(checkoutCompletedRaw, now() + 301)
    expect(client().verifyWebhook(checkoutCompletedRaw, future)).toBeNull()
  })

  it('rejects missing or malformed headers', () => {
    expect(client().verifyWebhook(checkoutCompletedRaw, null)).toBeNull()
    expect(client().verifyWebhook(checkoutCompletedRaw, '')).toBeNull()
    expect(client().verifyWebhook(checkoutCompletedRaw, 'v1=deadbeef')).toBeNull()
    expect(client().verifyWebhook(checkoutCompletedRaw, `t=${now()}`)).toBeNull()
    expect(client().verifyWebhook(checkoutCompletedRaw, `t=abc,v1=deadbeef`)).toBeNull()
  })

  it('throws StripeError when constructed without a webhookSecret (loud misconfiguration)', () => {
    const misconfigured = new RealStripeClient({ apiKey: 'sk_test_key' })
    expect(() =>
      misconfigured.verifyWebhook(checkoutCompletedRaw, sign(checkoutCompletedRaw, now())),
    ).toThrow(StripeError)
  })
})

describe('parseStripeEvent', () => {
  it('is the shared mapper: same result via fixture verify and direct call', () => {
    expect(parseStripeEvent(checkoutCompletedRaw)).toEqual(
      new FixtureStripeClient().verifyWebhook(checkoutCompletedRaw, null),
    )
  })
})

describe('resolveStripe', () => {
  it('returns the fixture without STRIPE_SECRET_KEY and the real client with it', () => {
    expect(resolveStripe({} as NodeJS.ProcessEnv)).toBeInstanceOf(FixtureStripeClient)
    expect(
      resolveStripe({
        STRIPE_SECRET_KEY: 'sk_test_key',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(RealStripeClient)
  })
})
