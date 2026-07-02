const PATTERN = process.env.PREVIEW_URL_PATTERN ?? 'http://{slug}.localhost:3000'

/** Absolute preview URL for a site slug on the sites app. */
export function previewUrl(slug: string): string {
  return PATTERN.replaceAll('{slug}', slug)
}
