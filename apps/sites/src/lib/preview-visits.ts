import { createHash } from 'node:crypto'
import { previewVisits } from '@tradies/db/schema'
import type { getDb } from './db'

/**
 * Buying-signal logging: hashed visitor identity only (no raw IPs stored),
 * operator visits flagged so they never inflate engagement. Runs via after()
 * so it can never block TTFB.
 */

function hash(value: string): string {
  const salt = process.env.PREVIEW_VISIT_SALT ?? 'dev-salt'
  return createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 32)
}

export async function logPreviewVisit(
  db: ReturnType<typeof getDb>,
  input: {
    siteId: string
    path: string
    ip: string | null
    userAgent: string | null
    referrer: string | null
    isOperator: boolean
  },
): Promise<void> {
  try {
    await db.insert(previewVisits).values({
      siteId: input.siteId,
      path: input.path,
      ipHash: input.ip ? hash(input.ip) : null,
      uaHash: input.userAgent ? hash(input.userAgent) : null,
      referrer: input.referrer,
      isOperator: input.isOperator,
      visitedAt: new Date(),
    })
  } catch (err) {
    // logging must never break a preview render
    console.warn('[preview-visits] insert failed:', err)
  }
}
