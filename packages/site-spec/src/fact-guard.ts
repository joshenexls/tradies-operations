import type { BusinessFacts } from './facts'
import { ACCREDITATION_LABELS } from './facts'
import type { SiteSpec } from './site-spec'

/**
 * FACT-GUARD: rejects specs whose copy asserts facts not grounded in the
 * facts sheet. This is the hard implementation of the DMCC/CMA guardrail —
 * fabricated reviews, accreditations, history, guarantees or superlatives are
 * blocked by a validator, not a prompt. It runs after Zod shape validation
 * and before any spec is persisted.
 */

export type Violation = {
  code:
    | 'unevidenced_badge'
    | 'unevidenced_history'
    | 'history_mismatch'
    | 'review_like_content'
    | 'unevidenced_claim'
    | 'contact_mismatch'
    | 'unknown_service_area'
  path: string
  message: string
  snippet?: string
}

export type ValidationReport = {
  ok: boolean
  violations: Violation[]
}

type Located = { path: string; text: string }

/** Collect every human-readable string in the spec with its JSON path. */
function collectStrings(value: unknown, path: string, out: Located[]): void {
  if (typeof value === 'string') {
    out.push({ path, text: value })
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // alt text, ids and enum-ish fields are not factual copy
      if (['pool', 'icon', 'variant', 'kind', 'paletteId', 'fontPairId', 'radius'].includes(k))
        continue
      collectStrings(v, path === '' ? k : `${path}.${k}`, out)
    }
  }
}

const digitsOnly = (s: string) => s.replace(/\D/g, '')

function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a)
  const db = digitsOnly(b)
  if (!da || !db) return false
  const tail = Math.min(da.length, db.length, 10)
  return da.slice(-tail) === db.slice(-tail)
}

// "established 1998", "est. 2004", "since 2010", "serving Leeds since 1995"
const HISTORY_YEAR = /\b(?:established|est\.?|since|founded)\s+(?:in\s+)?((?:19|20)\d{2})\b/gi
// "25 years", "25+ years' experience"
const YEARS_CLAIM = /\b(\d{1,3})\s*\+?\s*years?[''s]*\b/gi

// review-shaped content that must never appear as static copy
const REVIEW_PATTERNS: RegExp[] = [
  /\btestimonial/i,
  /\b(five|5)[\s-]*star\b/i,
  /\brated\s+(us|\d|five)/i,
  /\bour\s+(customers|clients)\s+say\b/i,
  /["“][^"”]{25,}["”]\s*[-–—]\s*[A-Z][a-z]+/, // "long quote" — Name
  /\b\d(\.\d)?\s*(\/|out of)\s*5\b/i,
  /\b(google|trustpilot|checkatrade|yell)\s+(reviews?|rating)/i,
]

// claims that need evidence in facts.claims (or an evidenced accreditation)
const EVIDENCE_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bfully\s+insured\b|\binsured\b/i, label: 'insurance' },
  { pattern: /\bguaranteed?\b|\bguarantee\b/i, label: 'guarantee' },
  { pattern: /\bcertified\b/i, label: 'certification' },
  { pattern: /\blicen[cs]ed\b/i, label: 'licence' },
  { pattern: /\baccredited\b/i, label: 'accreditation' },
  { pattern: /\baward[\s-]*winning\b/i, label: 'award' },
  { pattern: /\b(best|#\s*1|no\.?\s*1|number\s+one)\b.{0,24}\b(in|of)\b/i, label: 'superlative' },
  { pattern: /\bdbs[\s-]*checked\b/i, label: 'DBS check' },
]

function factsText(facts: BusinessFacts): string {
  const parts: string[] = []
  for (const c of facts.claims) parts.push(c.value)
  for (const s of facts.services) parts.push(s.value)
  for (const a of facts.accreditations) parts.push(ACCREDITATION_LABELS[a.id])
  return parts.join(' \n ').toLowerCase()
}

export function validateSpecAgainstFacts(
  spec: SiteSpec,
  options: { now?: Date } = {},
): ValidationReport {
  const now = options.now ?? new Date()
  const facts = spec.facts
  const violations: Violation[] = []
  const located: Located[] = []
  collectStrings({ identity: spec.identity, sections: spec.sections, seo: spec.seo }, '', located)

  // 1. Badges must be evidenced accreditations
  const evidenced = new Set(facts.accreditations.map((a) => a.id))
  spec.sections.forEach((section, i) => {
    const badges = section.kind === 'hero' || section.kind === 'trust' ? (section.badges ?? []) : []
    for (const badge of badges) {
      if (!evidenced.has(badge)) {
        violations.push({
          code: 'unevidenced_badge',
          path: `sections[${i}].badges`,
          message: `Badge "${badge}" is not in the evidenced accreditations for this business`,
          snippet: badge,
        })
      }
    }
  })

  const allowedClaims = factsText(facts)

  for (const { path, text } of located) {
    // 2. History claims
    for (const match of text.matchAll(HISTORY_YEAR)) {
      const year = Number(match[1])
      if (!facts.foundedYear) {
        violations.push({
          code: 'unevidenced_history',
          path,
          message: 'Copy claims an establishment year but the facts sheet has no foundedYear',
          snippet: match[0],
        })
      } else if (year !== facts.foundedYear.value) {
        violations.push({
          code: 'history_mismatch',
          path,
          message: `Copy claims ${year} but the evidenced founding year is ${facts.foundedYear.value}`,
          snippet: match[0],
        })
      }
    }
    for (const match of text.matchAll(YEARS_CLAIM)) {
      const claimed = Number(match[1])
      if (claimed < 2) continue // "1 year guarantee on parts" style noise is caught by guarantee rule
      if (!facts.foundedYear) {
        violations.push({
          code: 'unevidenced_history',
          path,
          message: `Copy claims ${claimed} years of history but the facts sheet has no foundedYear`,
          snippet: match[0],
        })
      } else {
        const maxYears = now.getFullYear() - facts.foundedYear.value
        if (claimed > maxYears) {
          violations.push({
            code: 'history_mismatch',
            path,
            message: `Copy claims ${claimed} years but founding year ${facts.foundedYear.value} supports at most ${maxYears}`,
            snippet: match[0],
          })
        }
      }
    }

    // 3. Review-shaped content
    for (const pattern of REVIEW_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        violations.push({
          code: 'review_like_content',
          path,
          message:
            'Copy contains review/testimonial-shaped content; social proof is only the live Google widget or evidenced badges',
          snippet: match[0],
        })
        break
      }
    }

    // 4. Evidence-required keywords
    for (const { pattern, label } of EVIDENCE_KEYWORDS) {
      const match = text.match(pattern)
      if (match && !allowedClaims.includes(match[0].toLowerCase())) {
        // allow when the facts sheet substantiates the concept even if wording differs
        const concept = new RegExp(pattern.source, 'i')
        if (!concept.test(allowedClaims)) {
          violations.push({
            code: 'unevidenced_claim',
            path,
            message: `Copy makes an ${label} claim with no supporting entry in the facts sheet`,
            snippet: match[0],
          })
        }
      }
    }
  }

  // 5. Contact integrity
  if (spec.identity.phone) {
    if (!facts.phone || !phonesMatch(spec.identity.phone, facts.phone.value)) {
      violations.push({
        code: 'contact_mismatch',
        path: 'identity.phone',
        message: 'Displayed phone does not match the evidenced phone in the facts sheet',
        snippet: spec.identity.phone,
      })
    }
  }
  if (spec.identity.email) {
    if (!facts.email || spec.identity.email.toLowerCase() !== facts.email.value.toLowerCase()) {
      violations.push({
        code: 'contact_mismatch',
        path: 'identity.email',
        message: 'Displayed email does not match the evidenced email in the facts sheet',
        snippet: spec.identity.email,
      })
    }
  }

  // 6. Service areas must be grounded
  const allowedAreas = new Set(
    [...facts.serviceAreas, facts.town].map((a) => a.trim().toLowerCase()),
  )
  spec.sections.forEach((section, i) => {
    if (section.kind !== 'serviceArea') return
    section.areas.forEach((area, j) => {
      if (!allowedAreas.has(area.trim().toLowerCase())) {
        violations.push({
          code: 'unknown_service_area',
          path: `sections[${i}].areas[${j}]`,
          message: `Service area "${area}" is not in the facts sheet`,
          snippet: area,
        })
      }
    })
  })

  return { ok: violations.length === 0, violations }
}
