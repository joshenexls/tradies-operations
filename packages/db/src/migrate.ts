import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { Db } from './index'

/**
 * Apply the generated migrations (idempotent). Lives in its own entry point —
 * NOT re-exported from the package index — because the directory-URL trick is
 * unresolvable by Next's bundler; only Node scripts (seed/CLI/jobs) import it.
 */
export async function migrateDb(db: Db): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })
}
