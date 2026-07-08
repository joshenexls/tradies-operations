const PATTERN = process.env.PREVIEW_URL_PATTERN ?? 'http://{slug}.localhost:3000'

/** Absolute preview URL for a site slug on the sites app. */
export function previewUrl(slug: string): string {
  return PATTERN.replaceAll('{slug}', slug)
}

/**
 * Preview URL for links the OPERATOR clicks from the ops desk — ?op=1 marks
 * the visit as internal so engagement counts only reflect the prospect.
 */
export function operatorPreviewUrl(slug: string): string {
  const url = previewUrl(slug)
  return url.includes('?') ? `${url}&op=1` : `${url}?op=1`
}
