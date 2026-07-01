/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import { ACCREDITATION_LABELS } from '@tradies/site-spec'
import type { SectionComponentProps } from '../registry'
import { CheckIcon } from '../icons'
import { BadgeList, SectionHeader } from '../ui'

/** Accreditation text chips only — never fake logos. */
export function Trust({ section, family }: SectionComponentProps<'trust'>): ReactElement {
  switch (section.variant) {
    case 'badges': {
      const gap = section.heading ? family.tokens.contentGap : ''
      return (
        <div className={family.tokens.container}>
          <SectionHeader family={family} kicker="Accreditations" heading={section.heading} />
          <div className={gap}>
            <BadgeList
              ids={section.badges}
              family={family}
              center={family.tokens.align === 'center'}
            />
          </div>
        </div>
      )
    }
    case 'banner':
      return (
        <div className={family.tokens.container}>
          <div className="flex flex-col items-center gap-6 rounded-[var(--tp-radius)] bg-[var(--tp-primary)] px-6 py-10 text-center md:px-12">
            {section.heading ? (
              <h2 className="text-balance font-[family-name:var(--tp-font-heading)] text-2xl tracking-tight text-[var(--tp-on-primary)] [font-weight:var(--tp-heading-weight)]">
                {section.heading}
              </h2>
            ) : null}
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {section.badges.map((id) => (
                <li
                  key={id}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--tp-on-primary)]"
                >
                  <CheckIcon className="h-4 w-4 shrink-0" />
                  {ACCREDITATION_LABELS[id]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )
  }
}
