import type { SiteSpec } from './site-spec'
import { TRADE_SCHEMA_ORG_TYPE } from './trades'

/**
 * schema.org LocalBusiness JSON-LD for a generated site. Deliberately never
 * emits aggregateRating/review — ratings on our own markup would be a DMCC
 * fake-reviews exposure; Google surfaces ratings from the live GBP listing.
 */
export function buildJsonLd(spec: SiteSpec, options: { url?: string } = {}): string {
  const { identity, facts } = spec
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': TRADE_SCHEMA_ORG_TYPE[identity.trade],
    name: identity.businessName,
    address: {
      '@type': 'PostalAddress',
      addressLocality: identity.town,
      addressCountry: 'GB',
    },
  }
  if (identity.phone) data.telephone = identity.phone
  if (identity.email) data.email = identity.email
  if (options.url) data.url = options.url
  const areas = facts.serviceAreas.length > 0 ? facts.serviceAreas : [identity.town]
  data.areaServed = areas.map((name) => ({ '@type': 'Place', name }))
  const services = spec.sections.find((s) => s.kind === 'services')
  if (services && services.kind === 'services') {
    data.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: services.heading,
      itemListElement: services.items.map((item) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: item.title, description: item.description },
      })),
    }
  }
  return JSON.stringify(data)
}
