/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps } from '../registry'
import { PlusIcon } from '../icons'
import { SectionHeader } from '../ui'

export function Faq({ section, family }: SectionComponentProps<'faq'>): ReactElement {
  const header = <SectionHeader family={family} kicker="Good to know" heading={section.heading} />

  switch (section.variant) {
    case 'accordion':
      return (
        <div className={family.tokens.container}>
          {header}
          <div
            className={`mx-auto max-w-3xl divide-y divide-black/10 border-y border-black/10 ${family.tokens.contentGap}`}
          >
            {section.items.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-[var(--tp-ink)] [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <PlusIcon className="h-4 w-4 shrink-0 text-[var(--tp-primary)] transition-transform group-open:rotate-45" />
                </summary>
                <p className="mt-3 leading-relaxed text-[var(--tp-ink-muted)]">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )
    case 'two-column':
      return (
        <div className={family.tokens.container}>
          {header}
          <div className={`grid gap-x-12 gap-y-10 md:grid-cols-2 ${family.tokens.contentGap}`}>
            {section.items.map((item) => (
              <div key={item.question}>
                <h3 className="font-semibold text-[var(--tp-ink)]">{item.question}</h3>
                <p className="mt-2 leading-relaxed text-[var(--tp-ink-muted)]">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )
  }
}
