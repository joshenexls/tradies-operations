import { eq } from 'drizzle-orm'
import type { Prospect } from '@tradies/db'
import { events, permissionEvents, prospects, suppressionList } from '@tradies/db/schema'
import {
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePlaceId,
} from '@tradies/compliance'
import { EVENT_TYPES } from '@tradies/engine'
import type { getDb } from '@/lib/db'

type Db = ReturnType<typeof getDb>

export type SuppressReason = 'unsubscribe' | 'bounce' | 'complaint' | 'manual'

/** Bare address from 'Name <a@b>' or a plain address; null when unparseable. */
export function extractEmailAddress(value: string): string | null {
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(value)
  if (angled) return angled[1]!
  const trimmed = value.trim()
  return trimmed.includes('@') && !/\s/.test(trimmed) ? trimmed : null
}

/**
 * The one suppression writer for prospect opt-outs (webhooks, inbound STOP,
 * the /u link, inbox buttons): normalized suppression entries, an append-only
 * permission event, the prospect flipped to suppressed, and an audit event.
 * Suppressing an email always suppresses its domain too — every mailbox at a
 * business that opted out is off limits.
 */
export async function suppressProspect(
  db: Db,
  prospect: Prospect,
  input: {
    reason: SuppressReason
    sourceChannel: string
    /** Explicit address from the triggering payload; the profile email is always included too. */
    email?: string | null
    includePhone?: boolean
    includePlaceId?: boolean
    recordedBy?: string
    actor?: 'prospect' | 'operator' | 'system'
  },
): Promise<void> {
  const emails = new Set<string>()
  if (input.email) {
    const bare = extractEmailAddress(input.email)
    if (bare) emails.add(normalizeEmail(bare))
  }
  const profileEmail = prospect.extractedProfile?.email?.value
  if (profileEmail) emails.add(normalizeEmail(profileEmail))

  const entries: { kind: 'email' | 'domain' | 'phone' | 'place_id'; value: string }[] = []
  for (const email of emails) {
    entries.push({ kind: 'email', value: email })
    entries.push({ kind: 'domain', value: normalizeDomain(email) })
  }
  if (input.includePhone && prospect.phone) {
    entries.push({ kind: 'phone', value: normalizePhone(prospect.phone) })
  }
  if (input.includePlaceId && prospect.placeId) {
    entries.push({ kind: 'place_id', value: normalizePlaceId(prospect.placeId) })
  }
  for (const entry of entries) {
    await db
      .insert(suppressionList)
      .values({
        ...entry,
        reason: input.reason,
        sourceChannel: input.sourceChannel,
        prospectId: prospect.id,
      })
      .onConflictDoNothing()
  }

  await db.insert(permissionEvents).values({
    prospectId: prospect.id,
    kind: 'unsubscribed',
    channel: 'email',
    details: { reason: input.reason, source: input.sourceChannel },
    recordedBy: input.recordedBy ?? 'system',
  })
  await db
    .update(prospects)
    .set({ status: 'suppressed', suppressedAt: new Date(), updatedAt: new Date() })
    .where(eq(prospects.id, prospect.id))
  await db.insert(events).values({
    prospectId: prospect.id,
    actor: input.actor ?? 'prospect',
    type: EVENT_TYPES.prospectSuppressed,
    payload: { reason: input.reason, source: input.sourceChannel },
  })
}
