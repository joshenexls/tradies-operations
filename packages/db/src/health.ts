import { sql } from 'drizzle-orm'
import type { Db } from './index'
import journal from '../drizzle/meta/_journal.json'

export type MigrationStatus = {
  /** Rows recorded in drizzle.__drizzle_migrations. */
  applied: number
  /** Migrations shipped in drizzle/meta/_journal.json. */
  expected: number
  /** True when every shipped migration is recorded as applied. */
  upToDate: boolean
  /** Tags present in the journal but not yet applied (in order). */
  pending: string[]
}

const expectedEntries = (journal.entries as { when: number; tag: string }[])
  .slice()
  .sort((a, b) => a.when - b.when)

/**
 * Compares the migrations recorded in drizzle.__drizzle_migrations against the
 * journal shipped in this package. Drizzle's migrator stores each migration's
 * `folderMillis` (the journal `when`) as `created_at`, so a migration is
 * "applied" once its `when` is covered by a recorded row. Safe from the
 * Cloudflare Workers bundle: the journal is a static JSON import (inlined at
 * build — no fs/glob, unlike migrate.ts) and only one raw SELECT runs. A
 * missing schema/table (nothing migrated yet) is treated as zero applied, not
 * an error, so the health surfaces can report "behind" rather than crash.
 */
export async function checkMigrations(db: Db): Promise<MigrationStatus> {
  const expected = expectedEntries.length
  let appliedWhens: number[] = []
  try {
    const res: unknown = await db.execute(
      sql`select created_at from drizzle.__drizzle_migrations order by created_at`,
    )
    appliedWhens = extractRows(res)
      .map((r) => Number((r as { created_at: unknown }).created_at))
      .filter((n) => Number.isFinite(n))
  } catch {
    appliedWhens = []
  }
  const newestApplied = appliedWhens.length > 0 ? Math.max(...appliedWhens) : -1
  const pending = expectedEntries.filter((e) => e.when > newestApplied).map((e) => e.tag)
  return {
    applied: appliedWhens.length,
    expected,
    upToDate: pending.length === 0 && appliedWhens.length >= expected,
    pending,
  }
}

/** drizzle's execute returns `{ rows }` on PGlite and an array on postgres-js. */
function extractRows(res: unknown): unknown[] {
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown }).rows)) {
    return (res as { rows: unknown[] }).rows
  }
  return []
}
