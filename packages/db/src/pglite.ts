import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { dbSchema } from './index'

/**
 * PGlite-backed client — in-memory when dataDir is omitted, persistent
 * otherwise. Lives in its own entry point (NOT re-exported from the package
 * index) so app bundles that only ever hit Postgres — the Cloudflare Workers
 * builds — never pull the PGlite WASM in. Node scripts (seed/CLI/tests)
 * import '@tradies/db/pglite' directly; `createDb` reaches it via a dynamic
 * import only when DATABASE_URL is absent.
 */
export function createPgliteDb(dataDir?: string) {
  // PGlite's node fs does a non-recursive mkdir — pre-create the path
  if (dataDir && !dataDir.startsWith('memory://')) mkdirSync(dataDir, { recursive: true })
  const client = new PGlite(dataDir)
  return drizzle(client, { schema: dbSchema })
}
