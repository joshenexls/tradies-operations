import { createDb, type Db } from '@tradies/db'

/**
 * Environment-selected data layer: DATABASE_URL (Supabase Postgres) when
 * provided, file-backed PGlite otherwise (shared with the CLI/seed scripts —
 * run those while the dev server is stopped; PGlite is single-process).
 * Resolved once at module load (top-level await — server-only module); the
 * globalThis cache keeps dev HMR re-evaluations from opening a second PGlite.
 */

declare global {
  var __tradiesDb: Db | undefined
}

const dbInstance: Db = (globalThis.__tradiesDb ??= await createDb())

export function getDb(): Db {
  return dbInstance
}
