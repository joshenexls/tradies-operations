import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * One-click unsubscribe tokens. The token embeds the prospect id and an
 * HMAC-SHA256 signature so the /u/{token} endpoint can be public (no auth,
 * no DB lookup before verification) without letting anyone forge an
 * unsubscribe for an arbitrary prospect. Pure node:crypto — shared by
 * apps/jobs (footer URL at queue time) and apps/ops (the /u route).
 */

const sign = (prospectId: string, secret: string): Buffer =>
  createHmac('sha256', secret).update(prospectId).digest()

export function buildUnsubscribeToken(prospectId: string, secret: string): string {
  const id = Buffer.from(prospectId, 'utf8').toString('base64url')
  const sig = sign(prospectId, secret).toString('base64url')
  return `${id}.${sig}`
}

/** Returns the prospect id for a valid token, null for anything else. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  let prospectId: string
  let given: Buffer
  try {
    prospectId = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8')
    given = Buffer.from(token.slice(dot + 1), 'base64url')
  } catch {
    return null
  }
  if (prospectId.length === 0) return null
  const expected = sign(prospectId, secret)
  // length is public (HMAC-SHA256 is always 32 bytes) — only the comparison
  // of same-length buffers needs to be constant-time
  if (given.length !== expected.length) return null
  return timingSafeEqual(given, expected) ? prospectId : null
}

/**
 * Shared secret resolution so jobs (token minting) and ops (token
 * verification) can never disagree in dev. PRODUCTION MUST SET
 * UNSUBSCRIBE_SECRET — a guessable one-click-unsubscribe HMAC is a PECR
 * exposure, so we FAIL LOUD in production rather than silently use the dev
 * default (dev/tests keep the fallback).
 */
export function resolveUnsubscribeSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UNSUBSCRIBE_SECRET) return env.UNSUBSCRIBE_SECRET
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'UNSUBSCRIBE_SECRET is required in production (PECR one-click-unsubscribe HMAC must not be the guessable dev default).',
    )
  }
  return 'tradies-dev-unsubscribe-secret'
}
