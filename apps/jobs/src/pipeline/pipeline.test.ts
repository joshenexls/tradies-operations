import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { events, outreachMessages, prospects, reviewRequests, sites } from '@tradies/db'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { seedStylePresets } from '@tradies/engine'
import { getFixture } from '@tradies/fixtures'
import {
  FixtureApifyClient,
  FixtureFirecrawlClient,
  FixturePsiClient,
  FixtureVisionJudge,
} from '@tradies/integrations'
import { FixtureFactsExtractor, FixtureLLM } from '@tradies/llm'
import { discoverCity } from './discover-city'
import { dispatchOutreach } from './dispatch-outreach'
import { enrichProspect } from './enrich-prospect'
import { expirePreviews } from './expire-previews'
import { generateSiteSpecStep } from './generate-step'
import { requestReview } from './request-review'
import { scoreWebsite } from './score-website'

/**
 * The end-to-end dry run: discovery → enrichment (evidence-checked) →
 * scoring → generation → review gate → outreach gates, entirely on fixtures
 * and PGlite. This is the Stage B acceptance test from the plan.
 */

const clients = {
  apify: new FixtureApifyClient(),
  firecrawl: new FixtureFirecrawlClient(),
  psi: new FixturePsiClient(),
  judge: new FixtureVisionJudge(),
  extractor: new FixtureFactsExtractor(),
}

describe('discovery → review → dispatch dry run', () => {
  let db: TestDb
  beforeEach(async () => {
    db = await createTestDb()
    await seedStylePresets(db)
  })

  it('warehouses Leeds plumbers idempotently with provenance, raw payloads and costs', async () => {
    const first = await discoverCity(
      db,
      { apify: clients.apify },
      { city: 'Leeds', trade: 'plumber' },
    )
    expect(first.created.length).toBeGreaterThan(0)
    const again = await discoverCity(
      db,
      { apify: clients.apify },
      { city: 'Leeds', trade: 'plumber' },
    )
    expect(again.created).toHaveLength(0)
    expect(again.updated.length).toBe(first.created.length)

    const rows = await db.select().from(prospects)
    expect(rows).toHaveLength(first.created.length)
    for (const row of rows) {
      expect(row.source).toBe('discovery')
      expect(row.apifyRaw).toBeTruthy()
      expect(row.dataProvenance).toBeTruthy()
      expect(row.entityType).toBe('unknown')
    }
    const costs = await db.query.prospectCosts.findMany()
    expect(costs.filter((c) => c.category === 'places')).toHaveLength(first.created.length)
  })

  it('enriches only evidence-backed facts from the scraped site', async () => {
    const fixture = getFixture('leeds-plumber-swift')
    await discoverCity(db, { apify: clients.apify }, { city: 'Leeds', trade: 'plumber' })
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.placeId, fixture.places.placeId))
    expect(prospect).toBeTruthy()

    const result = await enrichProspect(
      db,
      { firecrawl: clients.firecrawl, extractor: clients.extractor },
      { prospectId: prospect!.id },
    )
    expect(result.enriched).toBe(true)

    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect!.id))
    const profile = after!.extractedProfile!
    for (const service of profile.services ?? []) {
      if (service.source === 'own_website' && service.quote) {
        expect(fixture.scrapeMarkdown!.replace(/\s+/g, ' ')).toContain(
          service.quote.replace(/\s+/g, ' '),
        )
      }
    }
  })

  it('runs the full chain and gates outreach on manual entity classification', async () => {
    const fixture = getFixture('leeds-plumber-swift')
    await discoverCity(db, { apify: clients.apify }, { city: 'Leeds', trade: 'plumber' })
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.placeId, fixture.places.placeId))
    const id = prospect!.id

    await enrichProspect(
      db,
      { firecrawl: clients.firecrawl, extractor: clients.extractor },
      { prospectId: id },
    )
    const scored = await scoreWebsite(db, { psi: clients.psi }, { prospectId: id })
    expect(scored.segment).toBe('bad_site') // swift flow: low PSI, no https

    const generated = await generateSiteSpecStep(db, {
      prospectId: id,
      styleKey: 'modern',
      generator: new FixtureLLM(),
    })
    expect(generated.version).toBe(1)
    expect(generated.reports.fact.ok).toBe(true)

    const review = await requestReview(db, {
      prospectId: id,
      batchLabel: 'Test batch',
      city: 'Leeds',
      autoApprove: false,
    })
    expect(review.autoApproved).toBe(false)
    const [request] = await db
      .select()
      .from(reviewRequests)
      .where(eq(reviewRequests.id, review.requestId))
    expect(request?.status).toBe('pending')

    // entity still 'unknown' → gates block, event written, ZERO outreach rows
    const blocked = await dispatchOutreach(db, { prospectId: id, dryRun: true })
    expect(blocked.dispatched).toBe(false)
    expect(blocked.blockedReason).toBe('entity_unknown')
    let messages = await db.select().from(outreachMessages)
    expect(messages).toHaveLength(0)

    // operator marks corporate → gates pass; dry-run still writes no messages
    await db
      .update(prospects)
      .set({ entityType: 'corporate', entityCheckedAt: new Date() })
      .where(eq(prospects.id, id))
    const passed = await dispatchOutreach(db, { prospectId: id, dryRun: true })
    expect(passed.blockedReason).toBeUndefined()
    messages = await db.select().from(outreachMessages)
    expect(messages).toHaveLength(0)

    const eventRows = await db.select().from(events).where(eq(events.prospectId, id))
    const types = eventRows.map((e) => e.type)
    expect(types).toContain('outreach_blocked')
    expect(types).toContain('outreach_dry_run')
  })

  it('auto-approve batches complete the review instantly', async () => {
    const fixture = getFixture('leeds-plumber-swift')
    await discoverCity(db, { apify: clients.apify }, { city: 'Leeds', trade: 'plumber' })
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.placeId, fixture.places.placeId))
    await generateSiteSpecStep(db, {
      prospectId: prospect!.id,
      styleKey: 'modern',
      generator: new FixtureLLM(),
    })
    const review = await requestReview(db, {
      prospectId: prospect!.id,
      batchLabel: 'Auto batch',
      autoApprove: true,
    })
    expect(review.autoApproved).toBe(true)
    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect!.id))
    expect(after?.status).toBe('approved')
  })

  it('expires stale previews', async () => {
    const fixture = getFixture('leeds-plumber-swift')
    await discoverCity(db, { apify: clients.apify }, { city: 'Leeds', trade: 'plumber' })
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.placeId, fixture.places.placeId))
    await generateSiteSpecStep(db, {
      prospectId: prospect!.id,
      styleKey: 'modern',
      generator: new FixtureLLM(),
    })
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    const { expired } = await expirePreviews(db, future)
    expect(expired).toBe(1)
    const [site] = await db.select().from(sites).where(eq(sites.prospectId, prospect!.id))
    expect(site?.status).toBe('expired')
  })
})
