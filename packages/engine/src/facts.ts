import type { Prospect } from '@tradies/db'
import { businessFactsSchema, type BusinessFacts } from '@tradies/site-spec'

/**
 * Assemble the facts sheet the generator is allowed to use: the enrichment
 * extraction (already evidence-checked) overlaid with warehouse identity
 * fields. Nothing here is LLM-authored — provenance is preserved so
 * FACT-GUARD and the review screen can trace every claim.
 */
export function prospectToFacts(prospect: Prospect): BusinessFacts {
  const extracted = (prospect.extractedProfile ?? {}) as Partial<BusinessFacts>
  const town = prospect.city ?? 'your area'
  const warehouseSource =
    prospect.source === 'discovery' ? ('apify' as const) : ('operator' as const)
  return businessFactsSchema.parse({
    businessName: prospect.businessName ?? 'This business',
    trade: prospect.trade,
    town,
    phone:
      extracted.phone ??
      (prospect.phone ? { value: prospect.phone, source: warehouseSource } : undefined),
    email: extracted.email,
    serviceAreas:
      extracted.serviceAreas && extracted.serviceAreas.length > 0 ? extracted.serviceAreas : [town],
    services: extracted.services ?? [],
    accreditations: extracted.accreditations ?? [],
    foundedYear: extracted.foundedYear,
    claims: extracted.claims ?? [],
    companiesHouseNumber: prospect.companiesHouseNumber ?? undefined,
  })
}
