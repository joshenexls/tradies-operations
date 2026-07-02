import { describe, expect, it } from 'vitest'
import {
  FixtureSmartleadClient,
  RealSmartleadClient,
  SmartleadError,
  mapSmartleadWebhook,
} from './smartlead'
import type { CostEntry, FetchLike } from './types'

describe('FixtureSmartleadClient', () => {
  it('creates campaigns and leads with deterministic ids and records everything', async () => {
    const client = new FixtureSmartleadClient()
    const first = await client.createCampaign({ name: 'plumber Leeds' })
    const second = await client.createCampaign({ name: 'electrician Sheffield' })
    expect(first.campaignId).toBe('sl-camp-1')
    expect(second.campaignId).toBe('sl-camp-2')
    expect(client.campaigns.get('sl-camp-1')?.name).toBe('plumber Leeds')

    const lead = await client.addLead({
      campaignId: first.campaignId,
      lead: { email: 'info@swiftflowplumbing.example', company: 'Swift Flow Plumbing' },
      sequence: [{ step: 1, subject: 'Your new site', body: 'Hello…' }],
    })
    expect(lead.leadId).toBe('sl-lead-1')
    const recorded = client.leads.get('sl-lead-1')
    expect(recorded?.campaignId).toBe('sl-camp-1')
    expect(recorded?.sequence[0]?.subject).toBe('Your new site')
  })

  it('rejects leads for unknown campaigns with a typed error', async () => {
    const client = new FixtureSmartleadClient()
    await expect(
      client.addLead({
        campaignId: 'sl-camp-404',
        lead: { email: 'a@b.example' },
        sequence: [{ step: 1, subject: 's', body: 'b' }],
      }),
    ).rejects.toBeInstanceOf(SmartleadError)
  })

  it('records zero-cost email entries (sends are costed at dispatch)', async () => {
    const entries: CostEntry[] = []
    const client = new FixtureSmartleadClient({ recordCost: (e) => entries.push(e) })
    const { campaignId } = await client.createCampaign({ name: 'roofer York' })
    await client.addLead({
      campaignId,
      lead: { email: 'x@y.example' },
      sequence: [{ step: 1, subject: 's', body: 'b' }],
    })
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      expect(entry.category).toBe('email')
      expect(entry.amountMicroGbp).toBe(0)
    }
  })
})

function makeFetchStub(responses: Response[]) {
  const calls: { url: string; body: unknown }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? 'null')) })
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

describe('RealSmartleadClient', () => {
  it('creates a campaign via POST /campaigns/create with the api key in the query', async () => {
    const { fetchImpl, calls } = makeFetchStub([json({ ok: true, id: 98765 })])
    const client = new RealSmartleadClient({ apiKey: 'sl-key', fetchImpl })
    const result = await client.createCampaign({ name: 'plumber Leeds' })
    expect(result.campaignId).toBe('98765')
    expect(calls[0]?.url).toBe('https://server.smartlead.ai/api/v1/campaigns/create?api_key=sl-key')
    expect(calls[0]?.body).toEqual({ name: 'plumber Leeds' })
  })

  it('pushes the sequence then the lead with the documented request shapes', async () => {
    const { fetchImpl, calls } = makeFetchStub([
      json({ ok: true }),
      json({ ok: true, upload_count: 1 }),
    ])
    const client = new RealSmartleadClient({ apiKey: 'sl-key', fetchImpl })
    const result = await client.addLead({
      campaignId: '98765',
      lead: {
        email: 'info@swiftflowplumbing.example',
        firstName: 'Sam',
        company: 'Swift Flow Plumbing',
        customFields: { preview_url: 'http://swift.localhost:3000' },
      },
      sequence: [
        { step: 1, subject: 'Your new site', body: 'Hello…' },
        { step: 2, subject: 'Re: Your new site', body: 'Bumping this…' },
      ],
    })
    // no per-lead id in the bulk-upload response — email is the stable handle
    expect(result.leadId).toBe('info@swiftflowplumbing.example')

    expect(calls[0]?.url).toBe(
      'https://server.smartlead.ai/api/v1/campaigns/98765/sequences?api_key=sl-key',
    )
    expect(calls[0]?.body).toEqual({
      sequences: [
        {
          seq_number: 1,
          seq_delay_details: { delay_in_days: 0 },
          subject: 'Your new site',
          email_body: 'Hello…',
        },
        {
          seq_number: 2,
          seq_delay_details: { delay_in_days: 2 },
          subject: 'Re: Your new site',
          email_body: 'Bumping this…',
        },
      ],
    })
    expect(calls[1]?.url).toBe(
      'https://server.smartlead.ai/api/v1/campaigns/98765/leads?api_key=sl-key',
    )
    expect(calls[1]?.body).toEqual({
      lead_list: [
        {
          email: 'info@swiftflowplumbing.example',
          first_name: 'Sam',
          company_name: 'Swift Flow Plumbing',
          custom_fields: { preview_url: 'http://swift.localhost:3000' },
        },
      ],
    })
  })

  it('throws a typed SmartleadError with the status on non-2xx', async () => {
    const { fetchImpl } = makeFetchStub([json({ error: 'invalid api key' }, 401)])
    const client = new RealSmartleadClient({ apiKey: 'bad', fetchImpl })
    const promise = client.createCampaign({ name: 'x' })
    await expect(promise).rejects.toBeInstanceOf(SmartleadError)
    await expect(promise).rejects.toMatchObject({ status: 401 })
  })
})

describe('mapSmartleadWebhook', () => {
  // recorded-shape fixtures for the documented event_type variants
  const recorded = {
    sent: {
      event_type: 'EMAIL_SENT',
      campaign_id: 12345,
      sl_email_lead_id: '55501',
      sl_lead_email: 'info@swiftflowplumbing.example',
      sequence_number: 1,
    },
    open: {
      event_type: 'EMAIL_OPEN',
      campaign_id: 12345,
      sl_email_lead_id: '55501',
      sl_lead_email: 'info@swiftflowplumbing.example',
    },
    click: {
      event_type: 'EMAIL_CLICK',
      campaign_id: 12345,
      sl_email_lead_id: '55501',
      sl_lead_email: 'info@swiftflowplumbing.example',
      link_clicked: 'http://swift.localhost:3000',
    },
    reply: {
      event_type: 'EMAIL_REPLY',
      campaign_id: 12345,
      sl_email_lead_id: '55501',
      sl_lead_email: 'info@swiftflowplumbing.example',
      reply_body: 'Looks good, tell me more',
    },
    bounce: {
      event_type: 'EMAIL_BOUNCE',
      campaign_id: 12345,
      sl_email_lead_id: '55501',
      sl_lead_email: 'info@swiftflowplumbing.example',
    },
    unsubscribe: {
      event_type: 'LEAD_UNSUBSCRIBED',
      campaign_id: 12345,
      sl_lead_id: '55501',
      sl_lead_email: 'info@swiftflowplumbing.example',
    },
  }

  it.each([
    ['sent', recorded.sent],
    ['open', recorded.open],
    ['click', recorded.click],
    ['reply', recorded.reply],
    ['bounce', recorded.bounce],
    ['unsubscribe', recorded.unsubscribe],
  ] as const)('maps %s events', (kind, payload) => {
    expect(mapSmartleadWebhook(payload)).toEqual({
      kind,
      leadId: '55501',
      email: 'info@swiftflowplumbing.example',
      campaignId: '12345',
    })
  })

  it('is case-insensitive on event_type and tolerates missing optional fields', () => {
    expect(mapSmartleadWebhook({ event_type: 'email_reply' })).toEqual({ kind: 'reply' })
    expect(mapSmartleadWebhook({ eventType: 'EMAIL_OPENED', lead_id: 7 })).toEqual({
      kind: 'open',
      leadId: '7',
    })
  })

  it('returns null for unknown events and malformed payloads', () => {
    expect(mapSmartleadWebhook({ event_type: 'CAMPAIGN_PAUSED' })).toBeNull()
    expect(mapSmartleadWebhook({ something: 'else' })).toBeNull()
    expect(mapSmartleadWebhook('EMAIL_SENT')).toBeNull()
    expect(mapSmartleadWebhook(null)).toBeNull()
    expect(mapSmartleadWebhook(undefined)).toBeNull()
  })
})
