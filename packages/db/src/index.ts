import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as relations from './relations'
import * as schema from './schema'

export * from './schema'
export * from './relations'

/** Full query schema (tables + relations) for drizzle's relational queries. */
export const dbSchema = { ...schema, ...relations }

/**
 * PGlite-backed client — in-memory when dataDir is omitted, persistent
 * otherwise. Production (Supabase Postgres) swaps the driver, not the schema.
 */
export function createPgliteDb(dataDir?: string) {
  // PGlite's node fs does a non-recursive mkdir — pre-create the path
  if (dataDir && !dataDir.startsWith('memory://')) mkdirSync(dataDir, { recursive: true })
  const client = new PGlite(dataDir)
  return drizzle(client, { schema: dbSchema })
}

export type Db = ReturnType<typeof createPgliteDb>

export type Prospect = typeof schema.prospects.$inferSelect
export type NewProspect = typeof schema.prospects.$inferInsert
export type StylePresetRow = typeof schema.stylePresets.$inferSelect
export type NewStylePresetRow = typeof schema.stylePresets.$inferInsert
export type SiteSpecRow = typeof schema.siteSpecs.$inferSelect
export type NewSiteSpecRow = typeof schema.siteSpecs.$inferInsert
export type SiteRow = typeof schema.sites.$inferSelect
export type NewSiteRow = typeof schema.sites.$inferInsert
export type EditRequestRow = typeof schema.editRequests.$inferSelect
export type ReviewBatchRow = typeof schema.reviewBatches.$inferSelect
export type ReviewRequestRow = typeof schema.reviewRequests.$inferSelect
export type OutreachCampaignRow = typeof schema.outreachCampaigns.$inferSelect
export type OutreachMessageRow = typeof schema.outreachMessages.$inferSelect
export type NewOutreachMessageRow = typeof schema.outreachMessages.$inferInsert
export type PermissionEventRow = typeof schema.permissionEvents.$inferSelect
export type SuppressionEntryRow = typeof schema.suppressionList.$inferSelect
export type InboxThreadRow = typeof schema.inboxThreads.$inferSelect
export type InboxMessageRow = typeof schema.inboxMessages.$inferSelect
export type CustomerRow = typeof schema.customers.$inferSelect
export type SubscriptionRow = typeof schema.subscriptions.$inferSelect
export type LeadRow = typeof schema.leads.$inferSelect
export type NewLeadRow = typeof schema.leads.$inferInsert
export type ChatSessionRow = typeof schema.chatSessions.$inferSelect
export type PreviewVisitRow = typeof schema.previewVisits.$inferSelect
export type ProspectCostRow = typeof schema.prospectCosts.$inferSelect
export type EventRow = typeof schema.events.$inferSelect
export type DiscoveryRunRow = typeof schema.discoveryRuns.$inferSelect
export type OverturePlaceRow = typeof schema.overturePlaces.$inferSelect
