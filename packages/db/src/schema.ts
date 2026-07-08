import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { TRADES } from '@tradies/site-spec'
import type {
  BusinessFacts,
  HtmlSpecDoc,
  SectionKind,
  SiteSpec,
  SlotManifest,
  StylePreset,
  ValidationReport,
} from '@tradies/site-spec'

/**
 * The operational schema. Compliance rules that must survive any bug in the
 * application layer live HERE as constraints (the PECR cold-email gate, the
 * suppression uniqueness, the single Places-derived identifier), not in code.
 */

const id = () => uuid('id').primaryKey().defaultRandom()

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── enums ──────────────────────────────────────────────────────────────────

// mirrors the frozen trade contract so DB and spec can never drift
export const tradeEnum = pgEnum('trade', TRADES)

export const prospectSourceEnum = pgEnum('prospect_source', ['discovery', 'manual'])
export const entityTypeEnum = pgEnum('entity_type', ['corporate', 'individual', 'unknown'])
export const prospectStatusEnum = pgEnum('prospect_status', [
  'discovered',
  'classifying',
  'enriching',
  'scored',
  'generating',
  'in_review',
  'approved',
  'outreach_queued',
  'contacted',
  'replied',
  'claimed',
  'converted',
  'rejected',
  'suppressed',
  'expired',
])
export const prospectSegmentEnum = pgEnum('prospect_segment', ['no_site', 'bad_site', 'fine'])
export const stylePresetStatusEnum = pgEnum('style_preset_status', ['active', 'draft', 'retired'])
export const stylePresetKindEnum = pgEnum('style_preset_kind', ['component', 'html'])
export const designTemplateStatusEnum = pgEnum('design_template_status', [
  'draft',
  'active',
  'retired',
])
export const specGeneratedByEnum = pgEnum('spec_generated_by', ['llm', 'operator_edit'])
export const siteStatusEnum = pgEnum('site_status', [
  'preview',
  'claimed',
  'live',
  'expired',
  'disabled',
])
export const editRequestedByEnum = pgEnum('edit_requested_by', ['prospect', 'customer'])
export const editRequestStatusEnum = pgEnum('edit_request_status', [
  'new',
  'in_progress',
  'done',
  'declined',
])
export const reviewKindEnum = pgEnum('review_kind', ['site', 'pitch'])
export const reviewStatusEnum = pgEnum('review_status', [
  'pending',
  'approved',
  'regenerate',
  'rejected',
])

/**
 * DELIBERATELY NO 'sms' MEMBER. There is no cold-SMS code path in this
 * business (PECR treats SMS like email for individuals, and we never solicit
 * by SMS) — keeping the value out of the type means one can't be queued even
 * by a buggy caller.
 */
export const outreachChannelEnum = pgEnum('outreach_channel', [
  'email_cold',
  'email_solicited',
  'postcard',
])

export const legalBasisEnum = pgEnum('legal_basis', [
  'legitimate_interest_corporate',
  'granted_permission',
  'consent',
])
export const outreachMessageStatusEnum = pgEnum('outreach_message_status', [
  'queued',
  'approved',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'unsubscribed',
  'blocked_compliance',
])
export const permissionEventKindEnum = pgEnum('permission_event_kind', [
  'lia_recorded',
  'tps_screened',
  'phone_permission_granted',
  'phone_permission_denied',
  'email_opt_in',
  'unsubscribed',
  'erasure_requested',
])
export const suppressionKindEnum = pgEnum('suppression_kind', [
  'email',
  'domain',
  'phone',
  'place_id',
])
export const suppressionReasonEnum = pgEnum('suppression_reason', [
  'unsubscribe',
  'complaint',
  'bounce',
  'erasure',
  'manual',
])
export const inboxChannelEnum = pgEnum('inbox_channel', ['email', 'sms', 'call'])
export const inboxThreadStatusEnum = pgEnum('inbox_thread_status', [
  'open',
  'needs_reply',
  'closed',
])
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound'])
export const leadSourceEnum = pgEnum('lead_source', ['chatbot', 'form'])
export const leadNotificationChannelEnum = pgEnum('lead_notification_channel', [
  'whatsapp',
  'sms',
  'email',
])
export const costCategoryEnum = pgEnum('cost_category', [
  'llm',
  'firecrawl',
  'places',
  'psi',
  'email',
  'postcard',
  'other',
])
export const eventActorEnum = pgEnum('event_actor', ['system', 'operator', 'prospect', 'customer'])

// ── tables ─────────────────────────────────────────────────────────────────

export const prospects = pgTable(
  'prospects',
  {
    id: id(),
    /** Google place id as returned by the Apify Maps scraper — stable dedupe key. */
    placeId: text('place_id').unique(),
    hasWebsite: boolean('has_website'),
    isFacebookOnly: boolean('is_facebook_only'),
    overtureId: text('overture_id'),
    businessName: text('business_name'),
    address: text('address'),
    postcode: text('postcode'),
    city: text('city'),
    /** Written from Apify discovery payloads or operator input. */
    phone: text('phone'),
    /** normalizePhone(phone) — secondary dedupe key across discovery runs. */
    normalizedPhone: text('normalized_phone'),
    websiteUrl: text('website_url'),
    trade: tradeEnum('trade'),
    source: prospectSourceEnum('source'),
    entityType: entityTypeEnum('entity_type').default('unknown').notNull(),
    companiesHouseNumber: text('companies_house_number'),
    entityCheckedAt: timestamp('entity_checked_at', { withTimezone: true }),
    status: prospectStatusEnum('status').default('discovered').notNull(),
    segment: prospectSegmentEnum('segment'),
    websiteHealthScore: integer('website_health_score'),
    extractedProfile: jsonb('extracted_profile').$type<Partial<BusinessFacts>>(),
    /** Per-field source trail (which upstream produced each stored fact). */
    dataProvenance: jsonb('data_provenance').$type<Record<string, unknown>>(),
    /** Latest raw Apify item for this prospect — audit trail for disputed fields. */
    apifyRaw: jsonb('apify_raw'),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('prospects_normalized_phone_idx').on(t.normalizedPhone)],
)

export const designTemplates = pgTable('design_templates', {
  id: id(),
  name: text('name').notNull(),
  /** The uploaded generic lander — the structural skeleton for this system. */
  rawHtml: text('raw_html').notNull(),
  /** Optional uploaded components/style-system file (reference only). */
  componentsHtml: text('components_html'),
  annotatedHtml: text('annotated_html'),
  slotManifest: jsonb('slot_manifest').$type<SlotManifest>(),
  tokens: jsonb('tokens').$type<{ palette: string[]; fonts: string[] }>(),
  /** The lander's original slot texts — register/length exemplars for generation. */
  sampleTexts: jsonb('sample_texts').$type<Record<string, string>>(),
  sanitizationReport: jsonb('sanitization_report'),
  validationReport: jsonb('validation_report').$type<{ ok: boolean; problems: string[] }>(),
  ingestModel: text('ingest_model'),
  ingestUsage: jsonb('ingest_usage'),
  status: designTemplateStatusEnum('status').default('draft').notNull(),
  createdBy: text('created_by'),
  ...timestamps(),
})

export const pitches = pgTable(
  'pitches',
  {
    id: id(),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => prospects.id),
    version: integer('version').notNull(),
    subject: text('subject').notNull(),
    /** Body WITHOUT the legal footer — the footer is appended in code at send time. */
    body: text('body').notNull(),
    previewUrl: text('preview_url'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    ...timestamps(),
  },
  (t) => [unique('pitches_prospect_id_version_unique').on(t.prospectId, t.version)],
)

export const stylePresets = pgTable(
  'style_presets',
  {
    id: id(),
    styleKey: text('style_key').notNull(),
    name: text('name').notNull(),
    /** null = generic (any trade); otherwise a trade specialisation. */
    trade: tradeEnum('trade'),
    templateId: text('template_id').notNull(),
    description: text('description'),
    paletteId: text('palette_id').notNull(),
    fontPairId: text('font_pair_id').notNull(),
    radius: text('radius').$type<StylePreset['radius']>(),
    variantWeights: jsonb('variant_weights').$type<StylePreset['variantWeights']>(),
    preferredSections: jsonb('preferred_sections').$type<SectionKind[]>(),
    imageryPool: text('imagery_pool'),
    tone: text('tone').$type<StylePreset['tone']>(),
    status: stylePresetStatusEnum('status').default('active').notNull(),
    kind: stylePresetKindEnum('kind').default('component').notNull(),
    designTemplateId: uuid('design_template_id').references(() => designTemplates.id),
    thumbnailRef: text('thumbnail_ref'),
    createdBy: text('created_by'),
    ...timestamps(),
  },
  (t) => [
    // one specialisation per trade per style; nullsNotDistinct so there is
    // also only one generic (trade IS NULL) row per style key
    unique('style_presets_style_key_trade_unique').on(t.styleKey, t.trade).nullsNotDistinct(),
  ],
)

export const siteSpecs = pgTable(
  'site_specs',
  {
    id: id(),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => prospects.id),
    version: integer('version').notNull(),
    spec: jsonb('spec').$type<SiteSpec | HtmlSpecDoc>().notNull(),
    templateId: text('template_id'),
    stylePresetId: uuid('style_preset_id').references(() => stylePresets.id),
    designTemplateId: uuid('design_template_id').references(() => designTemplates.id),
    model: text('model'),
    promptVersion: text('prompt_version'),
    validationReport: jsonb('validation_report').$type<{
      fact: ValidationReport
      preset: { ok: boolean; violations: string[] }
    }>(),
    generatedBy: specGeneratedByEnum('generated_by'),
    regenerateFeedback: text('regenerate_feedback'),
    ...timestamps(),
  },
  (t) => [unique('site_specs_prospect_id_version_unique').on(t.prospectId, t.version)],
)

export const sites = pgTable('sites', {
  id: id(),
  prospectId: uuid('prospect_id')
    .notNull()
    .unique()
    .references(() => prospects.id),
  slug: text('slug').notNull().unique(),
  currentSpecVersion: integer('current_spec_version'),
  status: siteStatusEnum('status').default('preview').notNull(),
  previewExpiresAt: timestamp('preview_expires_at', { withTimezone: true }),
  /** Previews stay out of search indexes until the business claims the site. */
  noindex: boolean('noindex').default(true).notNull(),
  /** Customer-facing portal toggle for the chat widget. */
  chatbotEnabled: boolean('chatbot_enabled').default(true).notNull(),
  claimToken: text('claim_token').unique(),
  portalToken: text('portal_token').unique(),
  customDomain: text('custom_domain'),
  cfCustomHostnameId: text('cf_custom_hostname_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  ...timestamps(),
})

export const editRequests = pgTable('edit_requests', {
  id: id(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  requestedBy: editRequestedByEnum('requested_by'),
  body: text('body'),
  status: editRequestStatusEnum('status').default('new').notNull(),
  resultingSpecVersion: integer('resulting_spec_version'),
  ...timestamps(),
})

export const reviewBatches = pgTable('review_batches', {
  id: id(),
  label: text('label'),
  city: text('city'),
  status: text('status'),
  autoApprove: boolean('auto_approve').default(false).notNull(),
  ...timestamps(),
})

export const reviewRequests = pgTable('review_requests', {
  id: id(),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => reviewBatches.id),
  prospectId: uuid('prospect_id')
    .notNull()
    .references(() => prospects.id),
  kind: reviewKindEnum('kind').notNull(),
  waitpointToken: text('waitpoint_token'),
  status: reviewStatusEnum('status').default('pending').notNull(),
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  notes: text('notes'),
  stylePresetOverride: uuid('style_preset_override').references(() => stylePresets.id),
  ...timestamps(),
})

export const outreachCampaigns = pgTable('outreach_campaigns', {
  id: id(),
  name: text('name'),
  channel: outreachChannelEnum('channel'),
  sequence: jsonb('sequence'),
  smartleadCampaignId: text('smartlead_campaign_id'),
  sendingDomain: text('sending_domain'),
  ...timestamps(),
})

export const outreachMessages = pgTable(
  'outreach_messages',
  {
    id: id(),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => prospects.id),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => outreachCampaigns.id),
    step: integer('step'),
    channel: outreachChannelEnum('channel').notNull(),
    subject: text('subject'),
    body: text('body'),
    legalBasis: legalBasisEnum('legal_basis'),
    // NOT NULL: a CHECK passes on NULL, so an unset entity type would
    // otherwise slip straight through the PECR gate below
    entityTypeAtQueue: entityTypeEnum('entity_type_at_queue').notNull(),
    status: outreachMessageStatusEnum('status').default('queued').notNull(),
    blockedReason: text('blocked_reason'),
    smartleadLeadId: text('smartlead_lead_id'),
    providerMessageId: text('provider_message_id'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // the load-bearing PECR gate: cold email may only ever target a business
    // verified as corporate at queue time — enforced by Postgres, not code
    check(
      'outreach_messages_pecr_cold_email_corporate_only',
      sql`${t.channel} <> 'email_cold' OR ${t.entityTypeAtQueue} = 'corporate'`,
    ),
  ],
)

// append-only: rows are evidence of compliance actions, never updated
export const permissionEvents = pgTable('permission_events', {
  id: id(),
  prospectId: uuid('prospect_id')
    .notNull()
    .references(() => prospects.id),
  kind: permissionEventKindEnum('kind').notNull(),
  channel: text('channel'),
  details: jsonb('details'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  recordedBy: text('recorded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const suppressionList = pgTable(
  'suppression_list',
  {
    id: id(),
    kind: suppressionKindEnum('kind').notNull(),
    /** Normalized before insert (lowercased email/domain, E.164 phone). */
    value: text('value').notNull(),
    reason: suppressionReasonEnum('reason'),
    sourceChannel: text('source_channel'),
    prospectId: uuid('prospect_id').references(() => prospects.id),
    ...timestamps(),
  },
  (t) => [unique('suppression_list_kind_value_unique').on(t.kind, t.value)],
)

export const inboxThreads = pgTable('inbox_threads', {
  id: id(),
  prospectId: uuid('prospect_id')
    .notNull()
    .references(() => prospects.id),
  channel: inboxChannelEnum('channel').notNull(),
  subject: text('subject'),
  status: inboxThreadStatusEnum('status').default('open').notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  ...timestamps(),
})

export const inboxMessages = pgTable('inbox_messages', {
  id: id(),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => inboxThreads.id),
  direction: messageDirectionEnum('direction').notNull(),
  fromAddr: text('from_addr'),
  toAddr: text('to_addr'),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  /** Pointer to the raw payload in object storage, not the payload itself. */
  rawRef: text('raw_ref'),
  providerId: text('provider_id'),
  ...timestamps(),
})

export const customers = pgTable('customers', {
  id: id(),
  prospectId: uuid('prospect_id')
    .notNull()
    .references(() => prospects.id),
  // one customer per site — the claim flow upserts on this
  siteId: uuid('site_id')
    .notNull()
    .unique()
    .references(() => sites.id),
  email: text('email'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  leadAlertPhone: text('lead_alert_phone'),
  /** Where new-lead alert emails go; defaults to `email` at checkout completion. */
  leadAlertEmail: text('lead_alert_email'),
  /** Claim-form snapshot (confirmed business details, tosAcceptedAt). */
  intake: jsonb('intake'),
  gbpOauth: jsonb('gbp_oauth'),
  /** Our lifecycle, kept as text: pending_checkout | active | canceled | erased. */
  status: text('status'),
  ...timestamps(),
})

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  priceId: text('price_id'),
  /** Mirrors Stripe's vocabulary verbatim (active, past_due, canceled, …) — text on purpose. */
  status: text('status'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  ...timestamps(),
})

export const leads = pgTable('leads', {
  id: id(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  source: leadSourceEnum('source').notNull(),
  name: text('name'),
  phone: text('phone'),
  email: text('email'),
  message: text('message'),
  // plain uuid, no FK: chat sessions may be pruned long before their leads
  chatSessionId: uuid('chat_session_id'),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  notificationChannel: leadNotificationChannelEnum('notification_channel'),
  /** Customer marked this lead handled in the portal. */
  actionedAt: timestamp('actioned_at', { withTimezone: true }),
  ...timestamps(),
})

export const chatSessions = pgTable('chat_sessions', {
  id: id(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  visitorId: text('visitor_id'),
  messages: jsonb('messages'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  isDemo: boolean('is_demo').default(false).notNull(),
  ...timestamps(),
})

export const previewVisits = pgTable('preview_visits', {
  id: id(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  path: text('path'),
  /** Hashed, never raw — previews must not accumulate visitor PII. */
  ipHash: text('ip_hash'),
  uaHash: text('ua_hash'),
  referrer: text('referrer'),
  isOperator: boolean('is_operator').default(false).notNull(),
  visitedAt: timestamp('visited_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const prospectCosts = pgTable('prospect_costs', {
  id: id(),
  prospectId: uuid('prospect_id')
    .notNull()
    .references(() => prospects.id),
  category: costCategoryEnum('category').notNull(),
  provider: text('provider'),
  units: numeric('units'),
  /** Micro-GBP (1e-6 £) keeps sub-penny LLM costs in integer arithmetic. */
  amountMicroGbp: bigint('amount_micro_gbp', { mode: 'number' }),
  ref: text('ref'),
  ...timestamps(),
})

// append-only audit trail: rows are never updated
export const events = pgTable('events', {
  id: id(),
  prospectId: uuid('prospect_id').references(() => prospects.id),
  siteId: uuid('site_id').references(() => sites.id),
  actor: eventActorEnum('actor').notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const discoveryRuns = pgTable('discovery_runs', {
  id: id(),
  city: text('city'),
  trade: tradeEnum('trade'),
  query: jsonb('query'),
  resultsCount: integer('results_count'),
  apifyRunId: text('apify_run_id'),
  runAt: timestamp('run_at', { withTimezone: true }),
  ...timestamps(),
})

/** LEGACY: unused since the Phase 3 Apify amendment; retained to avoid a destructive migration. */
export const overturePlaces = pgTable('overture_places', {
  id: id(),
  overtureId: text('overture_id').unique(),
  name: text('name'),
  phone: text('phone'),
  website: text('website'),
  address: text('address'),
  postcode: text('postcode'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  categories: jsonb('categories'),
  releaseVersion: text('release_version'),
  ...timestamps(),
})
