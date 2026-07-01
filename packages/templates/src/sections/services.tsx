/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps, TemplateFamily } from '../registry'
import type { IconName } from '../icons'
import { Icon } from '../icons'
import { SectionHeader } from '../ui'

function Marker({
  icon,
  index,
  family,
}: {
  icon: IconName | undefined
  index: number
  family: TemplateFamily
}): ReactElement {
  return (
    <span className={family.tokens.iconBox}>
      {icon ? (
        <Icon name={icon} />
      ) : (
        <span className="text-sm font-bold">{String(index + 1).padStart(2, '0')}</span>
      )}
    </span>
  )
}

export function Services({ section, family }: SectionComponentProps<'services'>): ReactElement {
  const header = (
    <SectionHeader
      family={family}
      kicker="What we do"
      heading={section.heading}
      intro={section.intro}
    />
  )

  switch (section.variant) {
    case 'grid':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul
            className={`grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 ${family.tokens.contentGap}`}
          >
            {section.items.map((item, index) => (
              <li key={item.title}>
                <Marker icon={item.icon} index={index} family={family} />
                <h3 className="mt-4 font-[family-name:var(--tp-font-heading)] text-lg text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)]">
                  {item.title}
                </h3>
                <p className="mt-2 leading-relaxed text-[var(--tp-ink-muted)]">
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'cards':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${family.tokens.contentGap}`}>
            {section.items.map((item, index) => (
              <li key={item.title} className={family.tokens.card}>
                <Marker icon={item.icon} index={index} family={family} />
                <h3 className="mt-4 font-[family-name:var(--tp-font-heading)] text-lg text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)]">
                  {item.title}
                </h3>
                <p className="mt-2 leading-relaxed text-[var(--tp-ink-muted)]">
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'list':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul
            className={`mx-auto max-w-3xl divide-y divide-black/10 border-y border-black/10 ${family.tokens.contentGap}`}
          >
            {section.items.map((item, index) => (
              <li key={item.title} className="flex items-start gap-5 py-6">
                <Marker icon={item.icon} index={index} family={family} />
                <div>
                  <h3 className="font-[family-name:var(--tp-font-heading)] text-lg text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 leading-relaxed text-[var(--tp-ink-muted)]">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )
  }
}
