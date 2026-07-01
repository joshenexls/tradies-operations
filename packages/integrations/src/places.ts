import { allProspectFixtures } from '@tradies/fixtures'
import type { Trade } from '@tradies/site-spec'
import type { CostRecorder } from './types'

/**
 * THE PLACES CONTAINMENT BOUNDARY.
 *
 * Google Maps Platform ToS 3.2.3 forbids caching/storing Places content
 * (names, phones, ratings, reviews...). Everything downstream of discovery
 * therefore only ever sees PlacesSafeResult: the place id plus two booleans
 * we derived ourselves. The brand means the only way to obtain one is
 * toPlacesSafeResult(), which discards every other field at the boundary —
 * names, phones and ratings are not representable in the type system.
 */

declare const placesSafeBrand: unique symbol

export type PlacesSafeResult = {
  readonly placeId: string
  readonly hasWebsite: boolean
  readonly isFacebookOnly: boolean
  readonly [placesSafeBrand]: 'places-safe'
}

const SOCIAL_ONLY_HOSTS = ['facebook.com', 'fb.com', 'instagram.com']

function isSocialOnlyUrl(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    host = url.toLowerCase()
  }
  return SOCIAL_ONLY_HOSTS.some((social) => host === social || host.endsWith(`.${social}`))
}

/**
 * The only constructor for PlacesSafeResult. Takes the raw place id and
 * websiteUri and throws everything else away.
 *
 * Decision: a facebook.com/instagram.com websiteUri counts as NO real
 * website. These businesses are exactly our "no_site" prospects — a social
 * page is not a site we could score with PSI or replace — so hasWebsite is
 * false and isFacebookOnly is true.
 */
export function toPlacesSafeResult(raw: {
  placeId: string
  websiteUri?: string | null
}): PlacesSafeResult {
  const websiteUri = raw.websiteUri ?? undefined
  const isFacebookOnly = websiteUri !== undefined && isSocialOnlyUrl(websiteUri)
  const hasWebsite = websiteUri !== undefined && !isFacebookOnly
  return { placeId: raw.placeId, hasWebsite, isFacebookOnly } as PlacesSafeResult
}

export interface PlacesClient {
  searchTrade(input: { city: string; trade: Trade }): Promise<PlacesSafeResult[]>
  /**
   * Dial-time only: fetched fresh per call and never persisted. Callers must
   * not write the returned number anywhere durable (ToS 3.2.3 again).
   */
  fetchPhoneEphemeral(placeId: string): Promise<string | null>
}

export class FixturePlacesClient implements PlacesClient {
  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async searchTrade(input: { city: string; trade: Trade }): Promise<PlacesSafeResult[]> {
    this.options.recordCost?.({
      category: 'places',
      provider: 'google-places-fixture',
      units: 1,
      amountMicroGbp: 25_000, // ~£0.025 per Text Search request
      ref: `search:${input.city}:${input.trade}`,
    })
    return allProspectFixtures
      .filter((f) => f.trade === input.trade && f.town.toLowerCase() === input.city.toLowerCase())
      .map((f) =>
        // Reconstruct the raw shape so even fixtures pass the boundary.
        toPlacesSafeResult({
          placeId: f.places.placeId,
          websiteUri: f.isFacebookOnly
            ? `https://www.facebook.com/${f.key}`
            : (f.websiteUrl ?? null),
        }),
      )
  }

  async fetchPhoneEphemeral(placeId: string): Promise<string | null> {
    this.options.recordCost?.({
      category: 'places',
      provider: 'google-places-fixture',
      units: 1,
      amountMicroGbp: 14_000, // ~£0.014 per Place Details (contact fields)
      ref: `phone:${placeId}`,
    })
    const fixture = allProspectFixtures.find((f) => f.places.placeId === placeId)
    return fixture?.facts.phone?.value ?? null
  }
}
