import type { CostRecorder, FetchLike } from './types'

/**
 * Smartlead adapter (cold-email sequencer). The interface models exactly what
 * the dispatch step needs — create a campaign per (city, trade) and push one
 * lead with its personalised sequence. Send costs are recorded at dispatch
 * time by the pipeline, not here; webhook events are free.
 */

export type SmartleadSequenceStep = { step: number; subject: string; body: string }

export type SmartleadLeadInput = {
  email: string
  firstName?: string
  company?: string
  customFields?: Record<string, string>
}

export interface SmartleadClient {
  createCampaign(input: { name: string; sendingDomain?: string }): Promise<{ campaignId: string }>
  addLead(input: {
    campaignId: string
    lead: SmartleadLeadInput
    sequence: SmartleadSequenceStep[]
  }): Promise<{ leadId: string }>
}

/** Raised for non-2xx Smartlead responses; status carries the HTTP code. */
export class SmartleadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'SmartleadError'
  }
}

/**
 * In-memory Smartlead with deterministic ids (sl-camp-1, sl-lead-1, …).
 * Records every call so tests can assert exactly what would have been sent.
 */
export class FixtureSmartleadClient implements SmartleadClient {
  readonly campaigns = new Map<string, { name: string; sendingDomain?: string }>()
  readonly leads = new Map<
    string,
    { campaignId: string; lead: SmartleadLeadInput; sequence: SmartleadSequenceStep[] }
  >()
  private campaignSeq = 0
  private leadSeq = 0

  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async createCampaign(input: {
    name: string
    sendingDomain?: string
  }): Promise<{ campaignId: string }> {
    const campaignId = `sl-camp-${++this.campaignSeq}`
    this.campaigns.set(campaignId, { name: input.name, sendingDomain: input.sendingDomain })
    this.options.recordCost?.({
      category: 'email',
      provider: 'smartlead-fixture',
      units: 1,
      amountMicroGbp: 0, // campaigns are covered by the flat subscription
      ref: input.name,
    })
    return { campaignId }
  }

  async addLead(input: {
    campaignId: string
    lead: SmartleadLeadInput
    sequence: SmartleadSequenceStep[]
  }): Promise<{ leadId: string }> {
    if (!this.campaigns.has(input.campaignId)) {
      throw new SmartleadError(`unknown Smartlead campaign ${input.campaignId}`, 404)
    }
    const leadId = `sl-lead-${++this.leadSeq}`
    this.leads.set(leadId, input)
    this.options.recordCost?.({
      category: 'email',
      provider: 'smartlead-fixture',
      units: 1,
      amountMicroGbp: 0, // per-lead cost is recorded by dispatch, not the adapter
      ref: input.lead.email,
    })
    return { leadId }
  }
}

export type RealSmartleadClientOptions = {
  apiKey: string
  /** Injectable for tests — adapter tests must never hit the network. */
  fetchImpl?: FetchLike
  baseUrl?: string
  recordCost?: CostRecorder
}

const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1'

/**
 * Thin client over the documented endpoints: POST /campaigns/create,
 * POST /campaigns/{id}/sequences, POST /campaigns/{id}/leads. Smartlead
 * authenticates with an api_key query parameter.
 */
export class RealSmartleadClient implements SmartleadClient {
  private readonly fetchImpl: FetchLike
  private readonly baseUrl: string

  constructor(private readonly options: RealSmartleadClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = options.baseUrl ?? SMARTLEAD_BASE_URL
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}?api_key=${encodeURIComponent(this.options.apiKey)}`
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new SmartleadError(
        `Smartlead request failed (HTTP ${response.status}) — POST ${path}`,
        response.status,
      )
    }
    return (await response.json().catch(() => ({}))) as Record<string, unknown>
  }

  async createCampaign(input: {
    name: string
    sendingDomain?: string
  }): Promise<{ campaignId: string }> {
    const body = await this.post('/campaigns/create', { name: input.name })
    const id = body.id ?? (body.data as Record<string, unknown> | undefined)?.id
    if (id === undefined || id === null) {
      throw new SmartleadError('Smartlead create-campaign response missing an id', 502)
    }
    this.options.recordCost?.({
      category: 'email',
      provider: 'smartlead',
      units: 1,
      amountMicroGbp: 0, // covered by the flat subscription
      ref: input.name,
    })
    return { campaignId: String(id) }
  }

  async addLead(input: {
    campaignId: string
    lead: SmartleadLeadInput
    sequence: SmartleadSequenceStep[]
  }): Promise<{ leadId: string }> {
    // sequences first so a lead can never sit in a campaign with no steps
    await this.post(`/campaigns/${input.campaignId}/sequences`, {
      sequences: input.sequence.map((step) => ({
        seq_number: step.step,
        // step 1 sends immediately; follow-up cadence is a Smartlead-side policy
        seq_delay_details: { delay_in_days: step.step <= 1 ? 0 : 2 },
        subject: step.subject,
        email_body: step.body,
      })),
    })
    const body = await this.post(`/campaigns/${input.campaignId}/leads`, {
      lead_list: [
        {
          email: input.lead.email,
          first_name: input.lead.firstName,
          company_name: input.lead.company,
          custom_fields: input.lead.customFields ?? {},
        },
      ],
    })
    this.options.recordCost?.({
      category: 'email',
      provider: 'smartlead',
      units: 1,
      amountMicroGbp: 0, // dispatch records the send cost; the API call is free
      ref: input.lead.email,
    })
    // the bulk-upload response has no per-lead id — the email is the stable
    // handle until a webhook delivers Smartlead's own lead id
    const leadId = body.lead_id ?? (body.data as Record<string, unknown> | undefined)?.lead_id
    return { leadId: leadId === undefined || leadId === null ? input.lead.email : String(leadId) }
  }
}

// ── webhooks ────────────────────────────────────────────────────────────────

export type SmartleadWebhookEvent = {
  kind: 'sent' | 'open' | 'click' | 'reply' | 'bounce' | 'unsubscribe'
  leadId?: string
  email?: string
  campaignId?: string
}

const KIND_BY_EVENT_TYPE: Record<string, SmartleadWebhookEvent['kind']> = {
  EMAIL_SENT: 'sent',
  EMAIL_OPEN: 'open',
  EMAIL_OPENED: 'open',
  EMAIL_CLICK: 'click',
  EMAIL_LINK_CLICK: 'click',
  EMAIL_REPLY: 'reply',
  EMAIL_BOUNCE: 'bounce',
  LEAD_UNSUBSCRIBED: 'unsubscribe',
  LEAD_UNSUBSCRIBE: 'unsubscribe',
}

const pick = (source: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

/**
 * Normalize a Smartlead webhook payload to the one shape the ops route
 * consumes. Pure and tolerant: unknown event types (and non-object payloads)
 * map to null so the route can 200-and-ignore instead of erroring — Smartlead
 * retries non-2xx responses forever.
 */
export function mapSmartleadWebhook(payload: unknown): SmartleadWebhookEvent | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  const rawType = pick(record, ['event_type', 'eventType', 'event'])
  if (!rawType) return null
  const kind = KIND_BY_EVENT_TYPE[rawType.toUpperCase()]
  if (!kind) return null
  const event: SmartleadWebhookEvent = { kind }
  const leadId = pick(record, ['sl_email_lead_id', 'sl_lead_id', 'lead_id', 'leadId'])
  if (leadId) event.leadId = leadId
  const email = pick(record, ['sl_lead_email', 'lead_email', 'to_email', 'email'])
  if (email) event.email = email
  const campaignId = pick(record, ['campaign_id', 'campaignId'])
  if (campaignId) event.campaignId = campaignId
  return event
}
