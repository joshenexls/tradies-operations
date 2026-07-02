/* @jsxRuntime automatic @jsxImportSource react */
import type { SectionComponentProps } from '../registry'

/**
 * Retired. Social proof now lives in the Contact section as a compliant link to
 * the business's own real Google listing (see sections/contact.tsx). This
 * component renders nothing; renderSite also drops any 'reviews' section so no
 * empty band is emitted. The export + signature are kept so the registry switch
 * still type-checks.
 */
export function Reviews(_props: SectionComponentProps<'reviews'>): null {
  return null
}
