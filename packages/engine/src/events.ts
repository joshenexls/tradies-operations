/** Canonical event types written to the append-only events table. */
export const EVENT_TYPES = {
  entityClassified: 'entity_classified',
  specGenerated: 'spec_generated',
  generationFailed: 'generation_failed',
  reviewDecided: 'review_decided',
  prospectSuppressed: 'prospect_suppressed',
  erasureCompleted: 'erasure_completed',
  discoveryUpserted: 'discovery_upserted',
  prospectEnriched: 'prospect_enriched',
  websiteScored: 'website_scored',
  qaRendered: 'qa_rendered',
  pitchGenerated: 'pitch_generated',
  outreachDryRun: 'outreach_dry_run',
  outreachBlocked: 'outreach_blocked',
  previewExpired: 'preview_expired',
  claimStarted: 'claim_started',
  checkoutCompleted: 'checkout_completed',
  sitePublished: 'site_published',
  siteUnpublished: 'site_unpublished',
  siteDisabled: 'site_disabled',
  subscriptionUpdated: 'subscription_updated',
  editRequestCreated: 'edit_request_created',
  editRequestResolved: 'edit_request_resolved',
  leadAlertSent: 'lead_alert_sent',
  portalSettingChanged: 'portal_setting_changed',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
