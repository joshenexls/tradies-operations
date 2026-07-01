import { z } from 'zod'
import { tradeSchema } from './trades'

/**
 * The facts sheet: everything the generator is allowed to state about a
 * business. Built from Firecrawl extraction (with evidence quotes), Companies
 * House, Overture, or manual operator input — never by the LLM. FACT-GUARD
 * rejects any spec that makes a factual claim not grounded here (DMCC/CMA:
 * fabricated reviews, accreditations or history are blocked by validator,
 * not prompt).
 */

export const factSourceSchema = z.enum([
  'own_website', // extracted from the business's existing site (Firecrawl)
  'companies_house',
  'overture',
  'operator', // typed in by the operator (manual mode / corrections)
  'customer', // provided by the customer post-conversion (intake, edits)
])
export type FactSource = z.infer<typeof factSourceSchema>

export const evidencedFactSchema = z.object({
  value: z.string().min(1),
  source: factSourceSchema,
  /** Verbatim quote or reference backing the fact (e.g. text from their site). */
  quote: z.string().optional(),
})
export type EvidencedFact = z.infer<typeof evidencedFactSchema>

/** UK trade accreditation registry — the only badges a site may ever show. */
export const ACCREDITATION_IDS = [
  'gas-safe',
  'niceic',
  'napit',
  'trustmark',
  'city-and-guilds',
  'chas',
  'fensa',
  'competent-roofer',
  'watersafe',
  'oftec',
] as const
export const accreditationIdSchema = z.enum(ACCREDITATION_IDS)
export type AccreditationId = z.infer<typeof accreditationIdSchema>

export const ACCREDITATION_LABELS: Record<AccreditationId, string> = {
  'gas-safe': 'Gas Safe Registered',
  niceic: 'NICEIC Approved',
  napit: 'NAPIT Registered',
  trustmark: 'TrustMark Registered',
  'city-and-guilds': 'City & Guilds Qualified',
  chas: 'CHAS Accredited',
  fensa: 'FENSA Registered',
  'competent-roofer': 'CompetentRoofer Member',
  watersafe: 'WaterSafe Approved',
  oftec: 'OFTEC Registered',
}

export const businessFactsSchema = z.object({
  businessName: z.string().min(1),
  trade: tradeSchema,
  town: z.string().min(1),
  /** E.164 or national format; only from Overture/operator/customer — never Places. */
  phone: evidencedFactSchema.optional(),
  email: evidencedFactSchema.optional(),
  /** Towns/areas the business genuinely serves. */
  serviceAreas: z.array(z.string().min(1)).default([]),
  /** Services they actually offer (evidence-backed when scraped). */
  services: z.array(evidencedFactSchema).default([]),
  /** Accreditations with evidence — the ONLY source of badges. */
  accreditations: z
    .array(
      z.object({
        id: accreditationIdSchema,
        source: factSourceSchema,
        quote: z.string().optional(),
      }),
    )
    .default([]),
  /** Year founded/established, evidence-backed (their site or CH incorporation). */
  foundedYear: z
    .object({
      value: z.number().int().min(1800).max(2100),
      source: factSourceSchema,
      quote: z.string().optional(),
    })
    .optional(),
  /** Free-form verified claims (e.g. "fully insured") with evidence. */
  claims: z.array(evidencedFactSchema).default([]),
  companiesHouseNumber: z.string().optional(),
})
export type BusinessFacts = z.infer<typeof businessFactsSchema>
