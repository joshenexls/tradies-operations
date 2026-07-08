import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prospects, sites, siteSpecs } from './schema'
import { specFixture } from './test-fixtures'
import { createTestDb, type TestDb } from './test-harness'

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  await db.$client.close()
})

describe('prospects', () => {
  it('inserts with defaults and reads back', async () => {
    const [row] = await db
      .insert(prospects)
      .values({ placeId: 'ChIJdefaults-test', businessName: 'Acme Plumbing', trade: 'plumber' })
      .returning()

    expect(row).toBeDefined()
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(row?.entityType).toBe('unknown')
    expect(row?.status).toBe('discovered')
    expect(row?.createdAt).toBeInstanceOf(Date)
    expect(row?.updatedAt).toBeInstanceOf(Date)

    const found = await db.query.prospects.findFirst({
      where: (p, { eq }) => eq(p.placeId, 'ChIJdefaults-test'),
    })
    expect(found?.businessName).toBe('Acme Plumbing')
    expect(found?.trade).toBe('plumber')
  })
})

describe('outreach_channel enum', () => {
  it('has exactly the three permitted channels and no sms member', async () => {
    const res = await db.execute<{ enumlabel: string }>(sql`
      select e.enumlabel
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'outreach_channel'
      order by e.enumsortorder
    `)
    const labels = res.rows.map((r) => r.enumlabel)
    expect(labels).toEqual(['email_cold', 'email_solicited', 'postcard'])
    expect(labels.filter((l) => l.includes('sms'))).toEqual([])
  })
})

describe('relations', () => {
  it('joins prospect -> site and specs via the relational query API', async () => {
    const [prospect] = await db
      .insert(prospects)
      .values({ placeId: 'ChIJrelations-test', businessName: 'Joins Ltd' })
      .returning()
    if (!prospect) throw new Error('insert failed')

    await db.insert(sites).values({ prospectId: prospect.id, slug: 'joins-ltd' })
    await db.insert(siteSpecs).values({ prospectId: prospect.id, version: 1, spec: specFixture() })

    const found = await db.query.prospects.findFirst({
      where: (p, { eq }) => eq(p.id, prospect.id),
      with: { site: true, siteSpecs: true },
    })
    expect(found?.site?.slug).toBe('joins-ltd')
    expect(found?.siteSpecs).toHaveLength(1)
    const storedSpec = found?.siteSpecs[0]?.spec
    if (!storedSpec || 'kind' in storedSpec) throw new Error('expected a component spec')
    expect(storedSpec.identity.businessName).toBe('Smith & Sons Plumbing')
  })
})
