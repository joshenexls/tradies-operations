import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { createPgliteDb } from './pglite'

// resolved from this source file so tests work from any cwd
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

/**
 * Fresh in-memory PGlite with the real generated migrations applied — tests
 * exercise the exact SQL (constraints included) that will ship to Supabase.
 */
export async function createTestDb() {
  const db = createPgliteDb()
  await migrate(db, { migrationsFolder })
  return db
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
