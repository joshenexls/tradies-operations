import type { HtmlRenderContext } from '@tradies/html-templates'
import { buildJsonLdFromFacts, type BusinessFacts, type SiteLocation } from '@tradies/site-spec'
import type { TemplateContext } from '@tradies/templates'

const OPERATOR_NAME = process.env.OPERATOR_BRAND_NAME ?? 'Tradies Studio'

/** CHAT_WIDGET=0 hides the chat widget (visual-test stability); default on. */
export function chatWidgetEnabled(): boolean {
  return process.env.CHAT_WIDGET !== '0'
}

/**
 * MAPS_EMBED=0 blanks the map iframe (default on). The map loads from Google,
 * so it is network-dependent — the visual suite disables it to keep baselines
 * deterministic regardless of whether the runner has network. The reviews CTA
 * (a static link) is unaffected.
 */
export function mapsEmbedEnabled(): boolean {
  return process.env.MAPS_EMBED !== '0'
}

function gateLocation(location: SiteLocation | null | undefined): SiteLocation | null {
  if (!location) return null
  return mapsEmbedEnabled() ? location : { ...location, mapsEmbedSrc: '' }
}

export function buildTemplateContext(input: {
  siteId: string
  slug: string
  noindex: boolean
  placeId?: string | null
  location?: SiteLocation | null
  claimToken?: string | null
}): TemplateContext {
  return {
    resolveImage: (ref) => ({
      src: `/pool/${encodeURIComponent(ref.pool)}/${ref.index}`,
      width: 1600,
      height: 1000,
    }),
    leadFormAction: `/api/leads?site=${input.siteId}`,
    placeId: input.placeId ?? null,
    location: gateLocation(input.location),
    previewBanner: input.noindex
      ? {
          operatorName: OPERATOR_NAME,
          claimUrl: input.claimToken ? `/claim/${input.claimToken}` : undefined,
        }
      : null,
    privacyNoticeUrl: '/privacy-notice',
  }
}

/** The html-design-system twin of buildTemplateContext — same URLs, same banner rules. */
export function buildHtmlRenderContext(input: {
  siteId: string
  noindex: boolean
  facts: BusinessFacts
  claimToken?: string | null
  location?: SiteLocation | null
  /** sites.chatbotEnabled — the customer's portal toggle; defaults on. */
  chatbotEnabled?: boolean
}): HtmlRenderContext {
  return {
    resolveImage: (ref) => ({ src: `/pool/${encodeURIComponent(ref.pool)}/${ref.index}` }),
    leadFormAction: `/api/leads?site=${input.siteId}`,
    location: gateLocation(input.location),
    previewBanner: input.noindex
      ? {
          operatorName: OPERATOR_NAME,
          businessName: input.facts.businessName,
          claimUrl: input.claimToken ? `/claim/${input.claimToken}` : undefined,
        }
      : null,
    jsonLd: buildJsonLdFromFacts(input.facts),
    chatEmbed:
      chatWidgetEnabled() && (input.chatbotEnabled ?? true)
        ? { src: '/embed/v1.js', siteId: input.siteId, demo: input.noindex }
        : null,
    privacyNoticeUrl: '/privacy-notice',
  }
}
