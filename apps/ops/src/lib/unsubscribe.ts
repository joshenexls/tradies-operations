import { resolveUnsubscribeSecret, verifyUnsubscribeToken } from '@tradies/integrations'

/**
 * Ops-side view of the shared unsubscribe token helpers (the implementation
 * lives in @tradies/integrations so apps/jobs mints footer URLs with the
 * exact same HMAC scheme this app verifies).
 */

export { buildUnsubscribeToken, verifyUnsubscribeToken } from '@tradies/integrations'

/** Verify against the env-resolved secret; returns the prospect id or null. */
export function prospectIdFromToken(token: string): string | null {
  return verifyUnsubscribeToken(token, resolveUnsubscribeSecret())
}
