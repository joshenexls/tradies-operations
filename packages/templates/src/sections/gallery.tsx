/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps } from '../registry'
import { Img, SectionHeader } from '../ui'

export function Gallery({ section, ctx, family }: SectionComponentProps<'gallery'>): ReactElement {
  const header = <SectionHeader family={family} kicker="Recent work" heading={section.heading} />
  const gap = section.heading ? family.tokens.contentGap : ''

  switch (section.variant) {
    case 'grid':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${gap}`}>
            {section.images.map((image, index) => (
              <li key={index}>
                <Img
                  image={image}
                  ctx={ctx}
                  className={`aspect-[4/3] w-full object-cover ${family.tokens.image}`}
                />
              </li>
            ))}
          </ul>
        </div>
      )
    case 'strip':
      return (
        <div className={family.tokens.container}>
          {header}
          <ul className={`flex snap-x gap-4 overflow-x-auto pb-2 ${gap}`}>
            {section.images.map((image, index) => (
              <li key={index} className="w-72 shrink-0 snap-start md:w-80">
                <Img
                  image={image}
                  ctx={ctx}
                  className={`aspect-[4/3] w-full object-cover ${family.tokens.image}`}
                />
              </li>
            ))}
          </ul>
        </div>
      )
  }
}
