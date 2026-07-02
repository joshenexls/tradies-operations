import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as relations from './relations'
import * as schema from './schema'

export * from './schema'
export * from './relations'

/** Full query schema (tables + relations) for drizzle's relational queries. */
export const dbSchema = { ...schema, ...relations }

/**
 * The one Db type downstream code sees, whichever driver is behind it. It is
 * the PGlite drizzle shape (type-only import — no PGlite at runtime); the
 * postgres-js instance is runtime-compatible for everything this codebase
 * uses, so `createDb` casts it to keep a single type.
 */
export type Db = PgliteDatabase<typeof dbSchema>

/**
 * Environment-selected client: DATABASE_URL → Supabase/Postgres (postgres-js,
 * prepare:false so the transaction pooler is safe); otherwise local PGlite.
 * PGlite is loaded via dynamic import inside a NODE_ENV guard: bundlers fold
 * the condition in production builds, so the Cloudflare Workers bundles never
 * ship the PGlite WASM (production always sets DATABASE_URL) — hence async.
 */
export async function createDb(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  if (env.DATABASE_URL) {
    const client = postgres(env.DATABASE_URL, { prepare: false })
    return drizzlePostgres(client, { schema: dbSchema }) as unknown as Db
  }
  if (process.env.NODE_ENV !== 'production') {
    const { createPgliteDb } = await import('./pglite')
    return createPgliteDb(env.PGLITE_DIR ?? '.pglite/dev')
  }
  // NODE_ENV=production without DATABASE_URL: `next build` evaluates server
  // modules while collecting page data, so fail on first query — not at
  // module load. Every db-querying page is force-dynamic, so builds never
  // query; a deployment missing DATABASE_URL fails with this message instead.
  return new Proxy({} as Db, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      throw new Error(
        `@tradies/db: DATABASE_URL is required when NODE_ENV=production (accessed db.${prop})`,
      )
    },
  })
}

export type Prospect = typeof schema.prospects.$inferSelect
export type NewProspect = typeof schema.prospects.$inferInsert
export type DesignTemplateRow = typeof schema.designTemplates.$inferSelect
export type NewDesignTemplateRow = typeof schema.designTemplates.$inferInsert
export type PitchRow = typeof schema.pitches.$inferSelect
export type NewPitchRow = typeof schema.pitches.$inferInsert
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
