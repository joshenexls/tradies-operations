import { createDb } from '@tradies/db'

/**
 * Environment-selected data layer: DATABASE_URL (Supabase Postgres) when
 * provided, file-backed PGlite otherwise (shared with the CLI/seed scripts —
 * run those while the dev server is stopped; PGlite is single-process).
 */

type Db = ReturnType<typeof createDb>

declare global {
  var __tradiesDb: Db | undefined
}

export function getDb(): Db {
  if (!globalThis.__tradiesDb) {
    globalThis.__tradiesDb = createDb()
  }
  return globalThis.__tradiesDb
}
