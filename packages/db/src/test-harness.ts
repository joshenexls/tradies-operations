import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dbSchema } from './index'

// resolved from this source file so tests work from any cwd
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

/**
 * Fresh in-memory PGlite with the real generated migrations applied — tests
 * exercise the exact SQL (constraints included) that will ship to Supabase.
 */
export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle(client, { schema: dbSchema })
  await migrate(db, { migrationsFolder })
  return db
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
