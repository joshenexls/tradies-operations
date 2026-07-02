/**
 * Location + social-proof surfaces, built in CODE (never by the LLM) from
 * evidenced identity fields only — so they can never fabricate a rating or
 * point anywhere but the business's own real Google listing (DMCC/FACT-GUARD
 * hold by construction, the same way the legal footer is code-built).
 *
 * - The map is a keyless Google embed (the ONE external embed the sanitizer
 *   allows). Its query is TEXT, so it renders for every site, including
 *   manual prospects that have no place id.
 * - The reviews CTA needs a real place id (from Apify discovery) — only
 *   discovered prospects have a Google listing to point at.
 */

export type SiteLocation = {
  /** Keyless Google Maps embed URL for an <iframe src>. */
  mapsEmbedSrc: string
  /** The business's real Google reviews page, or null when no place id. */
  reviewsUrl: string | null
}

export function buildMapsEmbedSrc(input: {
  businessName: string
  town: string
  postcode?: string | null
  address?: string | null
}): string {
  const query =
    input.address?.trim() ||
    [input.businessName.trim(), input.town.trim()].filter(Boolean).join(', ') +
      (input.postcode?.trim() ? ` ${input.postcode.trim()}` : '')
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
}

export function buildGoogleReviewsUrl(placeId?: string | null): string | null {
  const trimmed = placeId?.trim()
  if (!trimmed) return null
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(trimmed)}`
}

/** Assemble both surfaces from a prospect's evidenced identity fields. */
export function buildSiteLocation(input: {
  businessName: string
  town: string
  postcode?: string | null
  address?: string | null
  placeId?: string | null
}): SiteLocation {
  return {
    mapsEmbedSrc: buildMapsEmbedSrc(input),
    reviewsUrl: buildGoogleReviewsUrl(input.placeId),
  }
}
