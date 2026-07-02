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
  outreachDryRun: 'outreach_dry_run',
  outreachBlocked: 'outreach_blocked',
  previewExpired: 'preview_expired',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
