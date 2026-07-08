import { eq } from 'drizzle-orm'
import { discoveryRuns, events, prospectCosts, prospects, type Db } from '@tradies/db'
import { normalizePhone } from '@tradies/compliance'
import { EVENT_TYPES } from '@tradies/engine'
import type { Trade } from '@tradies/site-spec'
import type { DiscoveryClient } from './types'

const SOCIAL_ONLY = /facebook\.com|fb\.com|instagram\.com/i

/**
 * Apify Google Maps discovery → prospects warehouse. Idempotent: dedupes by
 * place_id first, normalized phone second; re-runs refresh apify_raw and the
 * derived flags but never duplicate.
 */
export async function discoverCity(
  db: Db,
  deps: { apify: DiscoveryClient; costPerPlaceMicroGbp?: number },
  input: { city: string; trade: Trade; maxPlaces?: number },
): Promise<{ runId: string; created: string[]; updated: string[] }> {
  const maxPlaces = input.maxPlaces ?? 50
  const { runId, items } = await deps.apify.runGoogleMapsSearch({
    city: input.city,
    trade: input.trade,
    maxPlaces,
  })

  await db.insert(discoveryRuns).values({
    city: input.city,
    trade: input.trade,
    query: { source: 'apify-gmaps', maxPlaces },
    resultsCount: items.length,
    apifyRunId: runId,
    runAt: new Date(),
  })

  const created: string[] = []
  const updated: string[] = []
  const costPerPlace =
    deps.costPerPlaceMicroGbp ?? Number(process.env.APIFY_COST_PER_PLACE_MICROGBP ?? 2400)

  for (const item of items) {
    const website = item.website && !SOCIAL_ONLY.test(item.website) ? item.website : null
    const isFacebookOnly = Boolean(item.website && SOCIAL_ONLY.test(item.website))
    const normalizedPhone = item.phone ? normalizePhone(item.phone) : null
    const provenance = Object.fromEntries(
      (['businessName', 'address', 'postcode', 'city', 'phone', 'websiteUrl'] as const).map((f) => [
        f,
        { source: 'apify-gmaps', runId, at: new Date().toISOString() },
      ]),
    )
    const values = {
      placeId: item.placeId,
      hasWebsite: Boolean(website),
      isFacebookOnly,
      businessName: item.title,
      address: item.address ?? null,
      postcode: item.postcode ?? null,
      city: item.city ?? input.city,
      phone: item.phone ?? null,
      normalizedPhone,
      websiteUrl: website,
      trade: input.trade,
      source: 'discovery' as const,
      segment: website ? null : ('no_site' as const),
      status: 'discovered' as const,
      dataProvenance: provenance,
      apifyRaw: item,
    }

    const [byPlaceId] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(eq(prospects.placeId, item.placeId))
      .limit(1)
    const byPhone =
      !byPlaceId && normalizedPhone
        ? (
            await db
              .select({ id: prospects.id })
              .from(prospects)
              .where(eq(prospects.normalizedPhone, normalizedPhone))
              .limit(1)
          )[0]
        : undefined

    const existing = byPlaceId ?? byPhone
    if (existing) {
      await db
        .update(prospects)
        .set({ apifyRaw: item, hasWebsite: values.hasWebsite, isFacebookOnly, normalizedPhone })
        .where(eq(prospects.id, existing.id))
      updated.push(existing.id)
      continue
    }

    const [inserted] = await db.insert(prospects).values(values).returning({ id: prospects.id })
    if (!inserted) continue
    created.push(inserted.id)
    await db.insert(prospectCosts).values({
      prospectId: inserted.id,
      category: 'places',
      provider: 'apify-gmaps',
      units: '1',
      amountMicroGbp: costPerPlace,
      ref: runId,
    })
    await db.insert(events).values({
      prospectId: inserted.id,
      actor: 'system',
      type: EVENT_TYPES.discoveryUpserted,
      payload: { runId, city: input.city, trade: input.trade },
    })
  }

  return { runId, created, updated }
}
