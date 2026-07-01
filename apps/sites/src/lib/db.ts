import { createPgliteDb } from '@tradies/db'

/**
 * Phase 1 data layer: file-backed PGlite shared with the CLI/seed scripts
 * (run them while the dev server is stopped — PGlite is single-process).
 * Phase 2 swaps this for Supabase Postgres behind the same drizzle API.
 */

type Db = ReturnType<typeof createPgliteDb>

declare global {
  var __tradiesDb: Db | undefined
}

export function getDb(): Db {
  if (!globalThis.__tradiesDb) {
    globalThis.__tradiesDb = createPgliteDb(process.env.PGLITE_DIR ?? '.pglite/dev')
  }
  return globalThis.__tradiesDb
}
