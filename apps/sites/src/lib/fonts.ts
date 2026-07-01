import { getFontPair } from '@tradies/site-spec'

/** Google Fonts stylesheet URL for a spec's font pair (self-hosting: Phase 4). */
export function googleFontsUrl(fontPairId: string): string {
  const pair = getFontPair(fontPairId)
  const families = new Set([pair.heading, pair.body])
  const params = [...families]
    .map((f) => `family=${f.replaceAll(' ', '+')}:wght@400;500;${pair.headingWeight}`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}
