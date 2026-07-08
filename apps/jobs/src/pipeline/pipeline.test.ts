import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { validateLegalFooter } from '@tradies/compliance'
import {
  events,
  outreachCampaigns,
  outreachMessages,
  pitches,
  prospects,
  reviewRequests,
  siteSpecs,
  sites,
} from '@tradies/db'
import { createTestDb, type TestDb } from '@tradies/db/test-harness'
import { seedDesignTemplates, seedStylePresets } from '@tradies/engine'
import { getFixture } from '@tradies/fixtures'
import {
  FixtureApifyClient,
  FixtureFirecrawlClient,
  FixturePsiClient,
  FixtureSmartleadClient,
  FixtureVisionJudge,
} from '@tradies/integrations'
import {
  FixtureContentDocGenerator,
  FixtureFactsExtractor,
  FixtureLLM,
  FixturePitchGenerator,
} from '@tradies/llm'
import { discoverCity } from './discover-city'
import { buildFooterInput, dispatchOutreach, reconcileOutreach } from './dispatch-outreach'
import { enrichProspect } from './enrich-prospect'
import { expirePreviews } from './expire-previews'
import { generatePitchStep } from './generate-pitch-step'
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

    // pitch is generated before the review gate — operator reviews both
    const pitched = await generatePitchStep(db, {
      prospectId: id,
      generator: new FixturePitchGenerator(),
    })
    expect(pitched.pitch.version).toBe(1)
    expect(pitched.pitch.previewUrl).toContain(generated.slug)
    const pitchRows = await db.select().from(pitches).where(eq(pitches.prospectId, id))
    expect(pitchRows).toHaveLength(1)

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
    expect(await db.select().from(outreachMessages)).toHaveLength(0)
    expect(await db.select().from(outreachCampaigns)).toHaveLength(0)

    // operator marks corporate → gates pass; dry-run queues the message but
    // never talks to Smartlead (campaign row exists, provider id null)
    await db
      .update(prospects)
      .set({ entityType: 'corporate', entityCheckedAt: new Date() })
      .where(eq(prospects.id, id))
    const passed = await dispatchOutreach(db, { prospectId: id, dryRun: true })
    expect(passed.blockedReason).toBeUndefined()
    expect(passed.dispatched).toBe(false)

    const [campaign] = await db.select().from(outreachCampaigns)
    expect(campaign?.name).toBe('plumber Leeds')
    expect(campaign?.channel).toBe('email_cold')
    expect(campaign?.smartleadCampaignId).toBeNull()

    const messages = await db.select().from(outreachMessages)
    expect(messages).toHaveLength(1)
    const message = messages[0]!
    expect(message.status).toBe('queued')
    expect(message.channel).toBe('email_cold')
    expect(message.legalBasis).toBe('legitimate_interest_corporate')
    expect(message.entityTypeAtQueue).toBe('corporate')
    expect(message.subject).toBe(pitched.pitch.subject)
    expect(message.body).toContain(pitched.pitch.body)
    // the queued body carries a complete legal footer — nothing missing
    expect(validateLegalFooter(message.body ?? '', buildFooterInput(id))).toEqual([])

    // a second dispatch reuses the (city, trade) campaign
    await dispatchOutreach(db, { prospectId: id, dryRun: true })
    expect(await db.select().from(outreachCampaigns)).toHaveLength(1)

    const eventRows = await db.select().from(events).where(eq(events.prospectId, id))
    const types = eventRows.map((e) => e.type)
    expect(types).toContain('pitch_generated')
    expect(types).toContain('outreach_blocked')
    expect(types).toContain('outreach_dry_run')
  })

  it('runs the same chain for an html design system: generate → pitch → dry-run queued', async () => {
    const fixture = getFixture('leeds-plumber-swift')
    await seedDesignTemplates(db)
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

    const generated = await generateSiteSpecStep(db, {
      prospectId: id,
      styleKey: 'craftsman-dark',
      generator: new FixtureLLM(),
      contentDocGenerator: new FixtureContentDocGenerator(),
    })
    expect(generated.stored.kind).toBe('html')
    expect(generated.reports.fact.ok).toBe(true)
    const [specRow] = await db.select().from(siteSpecs).where(eq(siteSpecs.prospectId, id))
    expect(specRow?.templateId).toBe('html')
    expect(specRow?.designTemplateId).toBeTruthy()

    const pitched = await generatePitchStep(db, {
      prospectId: id,
      generator: new FixturePitchGenerator(),
    })
    expect(pitched.pitch.previewUrl).toContain(generated.slug)

    await db
      .update(prospects)
      .set({ entityType: 'corporate', entityCheckedAt: new Date() })
      .where(eq(prospects.id, id))
    const dispatched = await dispatchOutreach(db, { prospectId: id, dryRun: true })
    expect(dispatched.blockedReason).toBeUndefined()

    const [message] = await db.select().from(outreachMessages)
    expect(message?.status).toBe('queued')
    expect(message?.entityTypeAtQueue).toBe('corporate')
    expect(validateLegalFooter(message?.body ?? '', buildFooterInput(id))).toEqual([])
  })

  it('real dispatch pushes the lead + sequence to Smartlead and approves the message', async () => {
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
    await generateSiteSpecStep(db, {
      prospectId: id,
      styleKey: 'modern',
      generator: new FixtureLLM(),
    })
    await generatePitchStep(db, { prospectId: id, generator: new FixturePitchGenerator() })
    await db
      .update(prospects)
      .set({ entityType: 'corporate', entityCheckedAt: new Date() })
      .where(eq(prospects.id, id))

    const smartlead = new FixtureSmartleadClient()
    const result = await dispatchOutreach(db, { prospectId: id, dryRun: false, smartlead })
    expect(result.dispatched).toBe(true)

    const [campaign] = await db.select().from(outreachCampaigns)
    expect(campaign?.smartleadCampaignId).toBe('sl-camp-1')
    expect(smartlead.campaigns.get('sl-camp-1')?.name).toBe('plumber Leeds')

    const [message] = await db.select().from(outreachMessages)
    expect(message?.status).toBe('approved')
    expect(message?.smartleadLeadId).toBe('sl-lead-1')

    const lead = smartlead.leads.get('sl-lead-1')
    expect(lead?.lead.email).toBe('info@swiftflowplumbing.example')
    expect(lead?.sequence[0]?.subject).toBe(message?.subject)
    expect(lead?.sequence[0]?.body).toBe(message?.body)

    const [after] = await db.select().from(prospects).where(eq(prospects.id, id))
    expect(after?.status).toBe('outreach_queued')

    // reconcile is a fixture-safe counter over non-terminal messages
    expect(await reconcileOutreach(db, { realConfigured: false })).toEqual({
      checked: 1,
      synced: 0,
    })
  })

  it('the DB CHECK rejects a raw email_cold insert for a non-corporate prospect', async () => {
    const fixture = getFixture('leeds-plumber-swift')
    await discoverCity(db, { apify: clients.apify }, { city: 'Leeds', trade: 'plumber' })
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.placeId, fixture.places.placeId))
    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({ name: 'raw-check', channel: 'email_cold' })
      .returning()

    // bypass every code gate on purpose: Postgres itself must refuse the row
    const err = await db
      .insert(outreachMessages)
      .values({
        prospectId: prospect!.id,
        campaignId: campaign!.id,
        channel: 'email_cold',
        entityTypeAtQueue: 'individual',
      })
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(err, 'expected the insert to be rejected').not.toBeNull()
    expect(`${String(err)} ${String((err as Error).cause ?? '')}`).toMatch(
      /outreach_messages_pecr_cold_email_corporate_only/,
    )
    expect(await db.select().from(outreachMessages)).toHaveLength(0)
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
