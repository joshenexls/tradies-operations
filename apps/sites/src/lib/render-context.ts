import type { TemplateContext } from '@tradies/templates'

const OPERATOR_NAME = process.env.OPERATOR_BRAND_NAME ?? 'Tradies Studio'

export function buildTemplateContext(input: {
  siteId: string
  slug: string
  noindex: boolean
  placeId?: string | null
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
    previewBanner: input.noindex
      ? {
          operatorName: OPERATOR_NAME,
          claimUrl: input.claimToken ? `/claim/${input.claimToken}` : undefined,
        }
      : null,
    privacyNoticeUrl: '/privacy-notice',
  }
}
