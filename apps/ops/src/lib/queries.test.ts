import { describe, expect, it } from 'vitest'
import { previewVisits, prospects, sites } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { previewEngagement } from './queries'

// module-level so PGlite init isn't billed to the 5s test timeout under load
const db = await createTestDb()

describe('previewEngagement', () => {
  it('counts prospect visits and devices, excluding operator opens', async () => {
    const [prospect] = await db
      .insert(prospects)
      .values({ businessName: 'Engagement Test Ltd', status: 'contacted' })
      .returning()
    const [site] = await db
      .insert(sites)
      .values({ prospectId: prospect!.id, slug: 'engagement-test' })
      .returning()

    await db.insert(previewVisits).values([
      { siteId: site!.id, ipHash: 'hash-a', uaHash: 'ua-1', isOperator: false },
      { siteId: site!.id, ipHash: 'hash-a', uaHash: 'ua-1', isOperator: false },
      { siteId: site!.id, ipHash: 'hash-b', uaHash: 'ua-2', isOperator: false },
      // operator opens from the ops desk must not inflate the numbers
      { siteId: site!.id, ipHash: 'hash-op', uaHash: 'ua-op', isOperator: true },
    ])

    const engagement = await previewEngagement(db, [prospect!.id])
    expect(engagement.get(prospect!.id)).toMatchObject({ visits: 3, devices: 2 })
    expect(engagement.get(prospect!.id)?.lastVisitAt).toBeInstanceOf(Date)

    // prospects with no visits simply have no entry
    expect((await previewEngagement(db, ['00000000-0000-4000-8000-000000000000'])).size).toBe(0)
    expect((await previewEngagement(db, [])).size).toBe(0)
  })
})
