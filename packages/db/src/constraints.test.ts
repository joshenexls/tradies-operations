import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  outreachCampaigns,
  outreachMessages,
  prospects,
  siteSpecs,
  stylePresets,
  suppressionList,
} from './schema'
import { specFixture } from './test-fixtures'
import { createTestDb, type TestDb } from './test-harness'

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  await db.$client.close()
})

// drizzle may wrap driver errors, so match against the error chain
async function expectDbRejection(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err, 'expected the statement to be rejected').not.toBeNull()
  const text = `${String(err)} ${String((err as Error).cause ?? '')}`
  expect(text).toMatch(pattern)
}

async function makeProspect(placeId: string) {
  const [row] = await db.insert(prospects).values({ placeId }).returning()
  if (!row) throw new Error('prospect insert failed')
  return row
}

describe('site_specs unique(prospect_id, version)', () => {
  it('rejects a duplicate version for the same prospect', async () => {
    const prospect = await makeProspect('ChIJspec-version')
    const spec = specFixture()
    await db.insert(siteSpecs).values({ prospectId: prospect.id, version: 1, spec })
    await db.insert(siteSpecs).values({ prospectId: prospect.id, version: 2, spec })

    await expectDbRejection(
      db.insert(siteSpecs).values({ prospectId: prospect.id, version: 2, spec }),
      /site_specs_prospect_id_version_unique/,
    )
  })
})

describe('the PECR gate on outreach_messages', () => {
  let prospectId: string
  let campaignId: string

  beforeAll(async () => {
    prospectId = (await makeProspect('ChIJpecr-gate')).id
    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({ name: 'plumbers-leeds-1', channel: 'email_cold' })
      .returning()
    if (!campaign) throw new Error('campaign insert failed')
    campaignId = campaign.id
  })

  it('rejects cold email to an individual', async () => {
    await expectDbRejection(
      db.insert(outreachMessages).values({
        prospectId,
        campaignId,
        channel: 'email_cold',
        entityTypeAtQueue: 'individual',
      }),
      /check constraint.*outreach_messages_pecr_cold_email_corporate_only/,
    )
  })

  it('rejects cold email when entity type is still unknown', async () => {
    await expectDbRejection(
      db.insert(outreachMessages).values({
        prospectId,
        campaignId,
        channel: 'email_cold',
        entityTypeAtQueue: 'unknown',
      }),
      /check constraint.*outreach_messages_pecr_cold_email_corporate_only/,
    )
  })

  it('accepts cold email to a verified corporate', async () => {
    const [row] = await db
      .insert(outreachMessages)
      .values({
        prospectId,
        campaignId,
        channel: 'email_cold',
        entityTypeAtQueue: 'corporate',
        legalBasis: 'legitimate_interest_corporate',
      })
      .returning()
    expect(row?.status).toBe('queued')
  })

  it('accepts solicited email to an individual', async () => {
    const [row] = await db
      .insert(outreachMessages)
      .values({
        prospectId,
        campaignId,
        channel: 'email_solicited',
        entityTypeAtQueue: 'individual',
        legalBasis: 'granted_permission',
      })
      .returning()
    expect(row?.channel).toBe('email_solicited')
  })
})

describe('suppression_list unique(kind, value)', () => {
  it('rejects the same normalized value twice for a kind', async () => {
    await db.insert(suppressionList).values({
      kind: 'email',
      value: 'boiler@example.com',
      reason: 'unsubscribe',
    })
    await expectDbRejection(
      db.insert(suppressionList).values({
        kind: 'email',
        value: 'boiler@example.com',
        reason: 'complaint',
      }),
      /suppression_list_kind_value_unique/,
    )
  })

  it('allows the same value under a different kind', async () => {
    const [row] = await db
      .insert(suppressionList)
      .values({ kind: 'domain', value: 'boiler@example.com', reason: 'manual' })
      .returning()
    expect(row?.kind).toBe('domain')
  })
})

describe('style_presets unique(style_key, trade)', () => {
  const preset = {
    name: 'Modern',
    templateId: 'trade-classic',
    paletteId: 'navy-brass',
    fontPairId: 'archivo-inter',
  }

  it('rejects a second specialisation of the same style for the same trade', async () => {
    await db.insert(stylePresets).values({ ...preset, styleKey: 'modern', trade: 'plumber' })
    await expectDbRejection(
      db.insert(stylePresets).values({ ...preset, styleKey: 'modern', trade: 'plumber' }),
      /style_presets_style_key_trade_unique/,
    )
  })

  it('allows the same style key for a different trade', async () => {
    const [row] = await db
      .insert(stylePresets)
      .values({ ...preset, styleKey: 'modern', trade: 'roofer' })
      .returning()
    expect(row?.trade).toBe('roofer')
  })

  it('rejects a second generic (trade IS NULL) row per style key', async () => {
    await db.insert(stylePresets).values({ ...preset, styleKey: 'heritage', trade: null })
    await expectDbRejection(
      db.insert(stylePresets).values({ ...preset, styleKey: 'heritage', trade: null }),
      /style_presets_style_key_trade_unique/,
    )
  })
})
