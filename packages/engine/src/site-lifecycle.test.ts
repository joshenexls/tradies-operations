import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { events, prospects, sites } from '@tradies/db'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { disableSite, publishSite, unpublishSite } from './site-lifecycle'

describe('site lifecycle', () => {
  let db: TestDb
  let siteId: string
  let prospectId: string

  beforeEach(async () => {
    db = await createTestDb()
    const [prospect] = await db
      .insert(prospects)
      .values({ businessName: 'Lifecycle Test Ltd', status: 'contacted' })
      .returning()
    prospectId = prospect!.id
    const [site] = await db
      .insert(sites)
      .values({
        prospectId,
        slug: 'lifecycle-test',
        status: 'preview',
        noindex: true,
        previewExpiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning()
    siteId = site!.id
  })

  it('publishSite flips the whole go-live surface in one call', async () => {
    await publishSite(db, { siteId, actor: 'system', reason: 'checkout_completed' })
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
    expect(site!.status).toBe('live')
    expect(site!.noindex).toBe(false)
    expect(site!.publishedAt).toBeInstanceOf(Date)
    expect(site!.previewExpiresAt).toBeNull()
    const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId))
    expect(prospect!.status).toBe('converted')
    const rows = await db.select().from(events).where(eq(events.siteId, siteId))
    expect(rows.map((e) => e.type)).toContain('site_published')
  })

  it('unpublishSite hides the site but keeps the customer relationship', async () => {
    await publishSite(db, { siteId, actor: 'system' })
    const [before] = await db.select().from(sites).where(eq(sites.id, siteId))
    await unpublishSite(db, { siteId, actor: 'operator', reason: 'quality issue' })
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
    expect(site!.status).toBe('claimed')
    expect(site!.noindex).toBe(true)
    // publishedAt is history, not state — it survives unpublish
    expect(site!.publishedAt?.getTime()).toBe(before!.publishedAt?.getTime())
    const rows = await db.select().from(events).where(eq(events.siteId, siteId))
    expect(rows.map((e) => e.type)).toContain('site_unpublished')
  })

  it('re-publishing after unpublish keeps the original publishedAt', async () => {
    await publishSite(db, { siteId, actor: 'system' })
    const [first] = await db.select().from(sites).where(eq(sites.id, siteId))
    await unpublishSite(db, { siteId, actor: 'operator' })
    await publishSite(db, { siteId, actor: 'operator' })
    const [again] = await db.select().from(sites).where(eq(sites.id, siteId))
    expect(again!.publishedAt?.getTime()).toBe(first!.publishedAt?.getTime())
  })

  it('disableSite takes the site fully offline with an audited reason', async () => {
    await publishSite(db, { siteId, actor: 'system' })
    await disableSite(db, { siteId, actor: 'system', reason: 'subscription_ended' })
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
    expect(site!.status).toBe('disabled')
    expect(site!.noindex).toBe(true)
    const rows = await db.select().from(events).where(eq(events.siteId, siteId))
    const disabled = rows.find((e) => e.type === 'site_disabled')
    expect(disabled?.payload).toMatchObject({ reason: 'subscription_ended' })
  })

  it('throws on an unknown site id', async () => {
    await expect(
      publishSite(db, { siteId: '00000000-0000-4000-8000-000000000000', actor: 'system' }),
    ).rejects.toThrow(/unknown site/)
  })
})
