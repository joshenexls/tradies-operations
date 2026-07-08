import type { ImageRef, SiteLocation } from '@tradies/site-spec'

/** A resolved, ready-to-serve URL (plus intrinsic size when known) for a pool ImageRef. */
export type ResolvedImage = { src: string; width?: number; height?: number }

/**
 * Everything renderSite needs beyond the spec itself. Supplied by the host
 * (Next app, preview pipeline, tests) so the renderer stays pure: no I/O,
 * no env, no clock, no randomness inside this package.
 */
export type TemplateContext = {
  resolveImage(ref: ImageRef): ResolvedImage
  /** POST target for the lead form. */
  leadFormAction: string
  /** Google place id — the live reviews widget renders only when present. */
  placeId?: string | null
  /** Keyless map embed + real Google-listing reviews link, built in code. */
  location?: SiteLocation | null
  /** Set on concept previews; renders the compliance banner above the header. */
  previewBanner?: { operatorName: string; claimUrl?: string } | null
  /** Optional chat widget script, injected after the footer when set. */
  chatEmbedSrc?: string | null
  privacyNoticeUrl?: string
}
