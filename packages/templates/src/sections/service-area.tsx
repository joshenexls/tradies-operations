/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps } from '../registry'
import { SectionHeader } from '../ui'

export function ServiceArea({
  section,
  family,
}: SectionComponentProps<'serviceArea'>): ReactElement {
  const header = (
    <SectionHeader
      family={family}
      kicker="Where we work"
      heading={section.heading}
      intro={section.blurb}
    />
  )
  const justify = family.tokens.align === 'center' ? 'justify-center' : 'justify-start'

  switch (section.variant) {
    case 'chips':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul className={`flex flex-wrap gap-2.5 ${justify} ${family.tokens.contentGap}`}>
            {section.areas.map((area) => (
              <li key={area} className={family.tokens.chip}>
                {area}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'columns':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul
            className={`mx-auto grid max-w-4xl grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 ${family.tokens.contentGap}`}
          >
            {section.areas.map((area) => (
              <li key={area} className="flex items-center gap-2.5 text-[var(--tp-ink)]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tp-accent)]"
                  aria-hidden="true"
                />
                {area}
              </li>
            ))}
          </ul>
        </div>
      )
  }
}
