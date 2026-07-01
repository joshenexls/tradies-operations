import type { EntityType } from './channels'
import { ComplianceError } from './errors'

/**
 * Hard send gates. Every outreach path MUST call the relevant assert before
 * dispatch — these are the PECR/ICO rules as code, not guidance. Pure
 * functions: callers supply the data (entity checks, suppression list, TPS
 * screening dates) and wire the storage themselves.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / DAY_MS

/**
 * Cold email is only lawful to corporate subscribers (PECR reg 22), and
 * corporate status decays — companies dissolve, sole traders incorporate —
 * so a check older than maxEntityAgeDays counts as no check. 'unknown' is
 * treated as an individual (the ICO default) but gets its own error code so
 * callers can route it to re-verification rather than permanent rejection.
 */
export function assertColdEmailAllowed(
  input: { entityType: EntityType; entityCheckedAt: Date | null },
  opts: { now?: Date; maxEntityAgeDays?: number } = {},
): void {
  const now = opts.now ?? new Date()
  const maxEntityAgeDays = opts.maxEntityAgeDays ?? 90

  if (input.entityType === 'individual') {
    throw new ComplianceError(
      'not_corporate',
      'Cold email refused: individual subscriber (sole trader/partnership) — PECR reg 22 requires consent',
    )
  }
  if (input.entityType === 'unknown') {
    throw new ComplianceError(
      'entity_unknown',
      'Cold email refused: entity type unknown — treated as an individual subscriber until verified',
    )
  }
  if (input.entityCheckedAt === null) {
    throw new ComplianceError(
      'entity_check_stale',
      'Cold email refused: corporate status has never been verified',
    )
  }
  if (daysBetween(input.entityCheckedAt, now) > maxEntityAgeDays) {
    throw new ComplianceError(
      'entity_check_stale',
      `Cold email refused: corporate status was last verified more than ${maxEntityAgeDays} days ago — re-check before sending`,
    )
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Domain of an email address; a bare domain passes through unchanged. */
export function normalizeDomain(emailOrDomain: string): string {
  const normalized = normalizeEmail(emailOrDomain)
  const at = normalized.lastIndexOf('@')
  return at === -1 ? normalized : normalized.slice(at + 1)
}

/**
 * UK phone canonical form: digits only, trunk-prefixed ('+44…'/'0044…' → '0…')
 * so '+44 7700 900123' and '07700 900123' compare equal on a suppression list.
 */
export function normalizePhone(phone: string): string {
  // '(0)' is the parenthesised trunk zero in '+44 (0)7700…' — drop it before conversion
  const digits = phone.replace(/\(0\)/g, '').replace(/[^\d+]/g, '')
  const trunk = digits.startsWith('+44')
    ? `0${digits.slice(3)}`
    : digits.startsWith('0044')
      ? `0${digits.slice(4)}`
      : digits
  return trunk.replace(/\D/g, '')
}

/** Google place IDs are case-sensitive — trim only. */
export function normalizePlaceId(placeId: string): string {
  return placeId.trim()
}

export type SuppressionEntry = {
  kind: 'email' | 'domain' | 'phone' | 'place_id'
  value: string
}

export type SuppressionIdentity = {
  email?: string
  phone?: string
  placeId?: string
}

/**
 * One global suppression list: an opt-out anywhere suppresses everywhere.
 * A match of ANY kind blocks EVERY channel — a phone opt-out blocks email and
 * postcards to the same business, and a domain entry blocks every mailbox at
 * that domain. There is deliberately no channel parameter.
 */
export function checkSuppression(
  entries: SuppressionEntry[],
  identity: SuppressionIdentity,
): { suppressed: boolean; matches: SuppressionEntry[] } {
  const email = identity.email ? normalizeEmail(identity.email) : null
  const domain = identity.email ? normalizeDomain(identity.email) : null
  const phone = identity.phone ? normalizePhone(identity.phone) : null
  const placeId = identity.placeId ? normalizePlaceId(identity.placeId) : null

  const matches = entries.filter((entry) => {
    switch (entry.kind) {
      case 'email':
        return email !== null && normalizeEmail(entry.value) === email
      case 'domain':
        return domain !== null && normalizeDomain(entry.value) === domain
      case 'phone':
        return phone !== null && normalizePhone(entry.value) === phone
      case 'place_id':
        return placeId !== null && normalizePlaceId(entry.value) === placeId
    }
  })

  return { suppressed: matches.length > 0, matches }
}

export function assertNotSuppressed(
  entries: SuppressionEntry[],
  identity: SuppressionIdentity,
): void {
  const { suppressed, matches } = checkSuppression(entries, identity)
  if (suppressed) {
    const kinds = matches.map((m) => m.kind).join(', ')
    throw new ComplianceError(
      'suppressed',
      `Send refused: identity matches ${matches.length} suppression entr${matches.length === 1 ? 'y' : 'ies'} (${kinds}) — opt-outs apply to every channel`,
    )
  }
}

/**
 * TPS screening expires: the register changes daily and the industry-accepted
 * maximum age for a screening result is 28 days.
 */
export function tpsScreeningValid(
  screenedAt: Date | null,
  opts: { now?: Date; validityDays?: number } = {},
): boolean {
  if (screenedAt === null) return false
  const now = opts.now ?? new Date()
  const validityDays = opts.validityDays ?? 28
  return daysBetween(screenedAt, now) <= validityDays
}

export function assertCallAllowed(
  input: { tpsScreenedAt: Date | null },
  opts: { now?: Date; validityDays?: number } = {},
): void {
  if (input.tpsScreenedAt === null) {
    throw new ComplianceError(
      'tps_not_screened',
      'Call refused: number has never been screened against the TPS register',
    )
  }
  if (!tpsScreeningValid(input.tpsScreenedAt, opts)) {
    throw new ComplianceError(
      'tps_screening_stale',
      `Call refused: TPS screening is older than ${opts.validityDays ?? 28} days — re-screen before calling`,
    )
  }
}
