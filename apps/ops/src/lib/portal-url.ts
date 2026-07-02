import { previewUrl } from './preview-url'

/**
 * Claim/portal pages are served by the SITES app on the tenant host,
 * path-based under the preview origin — these helpers keep the ops desk
 * building the exact URLs a prospect/customer receives.
 */

/** Absolute claim URL for a site slug + claim token. */
export function claimUrl(slug: string, claimToken: string): string {
  return `${previewUrl(slug)}/claim/${claimToken}`
}

/** Absolute customer-portal URL for a site slug + portal token. */
export function portalUrl(slug: string, portalToken: string): string {
  return `${previewUrl(slug)}/portal/${portalToken}`
}
