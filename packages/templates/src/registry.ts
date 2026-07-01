import type { ReactElement } from 'react'
import type { Section, SectionKind, SiteSpec } from '@tradies/site-spec'
import type { TemplateContext } from './context'
import { classicFamily } from './families/classic'
import { modernFamily } from './families/modern'
import { boldFamily } from './families/bold'

export type FamilyChrome = { spec: SiteSpec; ctx: TemplateContext }

/**
 * Per-family design tokens consumed by the shared section components. Every
 * value must be a complete, literal Tailwind class string (never assembled
 * from fragments) so the consuming app's class scanner sees each class.
 */
export type FamilyTokens = {
  /** Horizontal container for section content. */
  container: string
  /** Section-header alignment personality. */
  align: 'center' | 'left'
  /** Wrapper around kicker/heading/intro. */
  headerWrap: string
  /** Small eyebrow label above section headings. */
  kicker: string
  /** Section heading (h2). */
  heading: string
  /** Lead paragraph under a section heading. */
  intro: string
  /** Vertical gap between a section header and its content. */
  contentGap: string
  card: string
  chip: string
  /** Accreditation badge chip. */
  badge: string
  /** Square icon slot for service items. */
  iconBox: string
  /** Primary CTA button. */
  cta: string
  /** Secondary/outline CTA button. */
  ctaGhost: string
  /** Form field label. */
  label: string
  /** Form input / textarea. */
  input: string
  /** Image treatment (rounding, border, shadow). */
  image: string
}

export type TemplateFamily = {
  id: string
  name: string
  Header: (props: FamilyChrome) => ReactElement
  Footer: (props: FamilyChrome) => ReactElement
  /** Band rhythm for a rendered section: background, borders and vertical spacing. */
  sectionFrame: (kind: SectionKind, index: number) => string
  tokens: FamilyTokens
}

export type SectionComponentProps<K extends SectionKind = SectionKind> = {
  section: Extract<Section, { kind: K }>
  spec: SiteSpec
  ctx: TemplateContext
  family: TemplateFamily
}

export const TEMPLATES: Record<string, TemplateFamily> = {
  classic: classicFamily,
  modern: modernFamily,
  bold: boldFamily,
}
