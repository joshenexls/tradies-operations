/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps } from '../registry'
import { SectionHeader } from '../ui'

/**
 * Social proof is the live Google widget only — no stored review text can
 * exist in a spec (DMCC/Google ToS). Without a place id the section renders
 * nothing at all (renderSite also skips the band).
 */
export function Reviews({
  section,
  ctx,
  family,
}: SectionComponentProps<'reviews'>): ReactElement | null {
  if (!ctx.placeId) return null
  const gap = section.heading ? family.tokens.contentGap : ''
  return (
    <div className={family.tokens.container}>
      <SectionHeader family={family} kicker="Reviews" heading={section.heading} />
      <div
        data-reviews-widget=""
        data-place-id={ctx.placeId}
        className={`min-h-44 rounded-[var(--tp-radius)] border border-dashed border-black/15 ${gap}`}
      />
    </div>
  )
}
