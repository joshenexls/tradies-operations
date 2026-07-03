import { describe, expect, it } from 'vitest'
import type { Db } from './index'
import { createPgliteDb } from './pglite'
import { checkMigrations } from './health'
import { createTestDb } from './test-harness'

describe('checkMigrations', () => {
  it('reports up-to-date against a freshly-migrated db', async () => {
    const db = await createTestDb()
    const status = await checkMigrations(db)
    expect(status.expected).toBeGreaterThan(0)
    expect(status.applied).toBe(status.expected)
    expect(status.upToDate).toBe(true)
    expect(status.pending).toEqual([])
  })

  it('reports every migration pending when nothing has been applied', async () => {
    // a raw PGlite with no migrations run — the migrations table does not exist
    const db = createPgliteDb() as unknown as Db
    const status = await checkMigrations(db)
    expect(status.applied).toBe(0)
    expect(status.upToDate).toBe(false)
    expect(status.pending).toHaveLength(status.expected)
    expect(status.pending[0]).toMatch(/^0000_/)
  })
})
