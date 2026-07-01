import type { SectionKind } from '@tradies/site-spec'
import { SECTION_VARIANTS } from '@tradies/site-spec'

export { renderSite } from './render-site'
export { TEMPLATES } from './registry'
export type { FamilyChrome, FamilyTokens, SectionComponentProps, TemplateFamily } from './registry'
export { SEED_STYLE_PRESETS } from './seed-presets'
export type { ResolvedImage, TemplateContext } from './context'

/** Section kind → variant ids, re-exported for the ops library UI. */
export function listSectionVariants(): Record<SectionKind, readonly string[]> {
  return SECTION_VARIANTS
}
