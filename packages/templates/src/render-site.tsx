/* @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties, ReactElement } from 'react'
import type { FontPair, Section, SiteSpec } from '@tradies/site-spec'
import { buildJsonLd, getFontPair, getPalette } from '@tradies/site-spec'
import type { TemplateContext } from './context'
import type { TemplateFamily } from './registry'
import { TEMPLATES } from './registry'
import { Hero } from './sections/hero'
import { Services } from './sections/services'
import { About } from './sections/about'
import { ServiceArea } from './sections/service-area'
import { Gallery } from './sections/gallery'
import { Reviews } from './sections/reviews'
import { Trust } from './sections/trust'
import { Faq } from './sections/faq'
import { Contact } from './sections/contact'

const RADIUS: Record<SiteSpec['theme']['radius'], string> = {
  sharp: '0',
  soft: '0.5rem',
  round: '1rem',
}

const SERIF_HEADINGS = new Set(['Fraunces', 'Bitter'])

function cssFamily(name: string): string {
  return name.includes(' ') ? `'${name}'` : name
}

function fontVars(pair: FontPair): { heading: string; body: string } {
  const headingFallback = SERIF_HEADINGS.has(pair.heading)
    ? "Georgia, 'Times New Roman', serif"
    : 'ui-sans-serif, system-ui, sans-serif'
  return {
    heading: `${cssFamily(pair.heading)}, ${headingFallback}`,
    body: `${cssFamily(pair.body)}, ui-sans-serif, system-ui, sans-serif`,
  }
}

function renderSection(
  section: Section,
  spec: SiteSpec,
  ctx: TemplateContext,
  family: TemplateFamily,
): ReactElement | null {
  switch (section.kind) {
    case 'hero':
      return <Hero section={section} spec={spec} ctx={ctx} family={family} />
    case 'services':
      return <Services section={section} spec={spec} ctx={ctx} family={family} />
    case 'about':
      return <About section={section} spec={spec} ctx={ctx} family={family} />
    case 'serviceArea':
      return <ServiceArea section={section} spec={spec} ctx={ctx} family={family} />
    case 'gallery':
      return <Gallery section={section} spec={spec} ctx={ctx} family={family} />
    case 'reviews':
      return <Reviews section={section} spec={spec} ctx={ctx} family={family} />
    case 'trust':
      return <Trust section={section} spec={spec} ctx={ctx} family={family} />
    case 'faq':
      return <Faq section={section} spec={spec} ctx={ctx} family={family} />
    case 'contact':
      return <Contact section={section} spec={spec} ctx={ctx} family={family} />
  }
}

function PreviewBanner({
  spec,
  ctx,
}: {
  spec: SiteSpec
  ctx: TemplateContext
}): ReactElement | null {
  const banner = ctx.previewBanner
  if (!banner) return null
  return (
    <div className="bg-[var(--tp-ink)] px-4 py-2.5 text-center text-sm text-white">
      <span>
        Concept preview by {banner.operatorName} — not the official website of{' '}
        {spec.identity.businessName}.
      </span>
      {banner.claimUrl ? (
        <a href={banner.claimUrl} className="ml-2 font-semibold underline underline-offset-2">
          Claim this website
        </a>
      ) : null}
    </div>
  )
}

/**
 * Pure renderer: SiteSpec + TemplateContext in, ReactElement out. No I/O,
 * no clock, no randomness — everything variable arrives via arguments.
 */
export function renderSite(spec: SiteSpec, ctx: TemplateContext): ReactElement {
  const family = TEMPLATES[spec.templateId]
  if (!family) {
    throw new Error(
      `Unknown templateId "${spec.templateId}" — registered: ${Object.keys(TEMPLATES).join(', ')}`,
    )
  }
  const palette = getPalette(spec.theme.paletteId)
  const fontPair = getFontPair(spec.theme.fontPairId)
  const fonts = fontVars(fontPair)
  const cssVars = {
    '--tp-primary': palette.primary,
    '--tp-on-primary': palette.onPrimary,
    '--tp-surface': palette.surface,
    '--tp-surface-alt': palette.surfaceAlt,
    '--tp-ink': palette.ink,
    '--tp-ink-muted': palette.inkMuted,
    '--tp-accent': palette.accent,
    '--tp-radius': RADIUS[spec.theme.radius],
    '--tp-font-heading': fonts.heading,
    '--tp-font-body': fonts.body,
    '--tp-heading-weight': String(fontPair.headingWeight),
  } as CSSProperties

  // the reviews band disappears entirely without a place id, keeping the
  // surface/surface-alt rhythm unbroken for the sections that do render
  const sections = spec.sections.filter((s) => s.kind !== 'reviews' || Boolean(ctx.placeId))

  return (
    <div
      style={cssVars}
      className="min-h-screen bg-[var(--tp-surface)] font-[family-name:var(--tp-font-body)] text-[var(--tp-ink)] antialiased"
    >
      <PreviewBanner spec={spec} ctx={ctx} />
      <family.Header spec={spec} ctx={ctx} />
      <main>
        {sections.map((section, index) => (
          <section
            key={section.kind}
            id={section.kind}
            className={family.sectionFrame(section.kind, index) || undefined}
          >
            {renderSection(section, spec, ctx, family)}
          </section>
        ))}
      </main>
      <family.Footer spec={spec} ctx={ctx} />
      {ctx.chatEmbedSrc ? <script src={ctx.chatEmbedSrc} defer /> : null}
      <script
        type="application/ld+json"
        // JSON.stringify output with `<` escaped so markup can never leak out of the tag
        dangerouslySetInnerHTML={{ __html: buildJsonLd(spec).replace(/</g, '\\u003c') }}
      />
    </div>
  )
}
