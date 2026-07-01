/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { Section } from '@tradies/site-spec'
import type { SectionComponentProps } from '../registry'
import { Img, SectionHeader } from '../ui'

type AboutSection = Extract<Section, { kind: 'about' }>

function Highlights({
  highlights,
  center = false,
}: {
  highlights: AboutSection['highlights']
  center?: boolean
}): ReactElement | null {
  if (highlights.length === 0) return null
  return (
    <dl
      className={
        center
          ? 'mt-8 flex flex-wrap justify-center gap-x-12 gap-y-6 border-t border-black/10 pt-6'
          : 'mt-8 flex flex-wrap gap-x-12 gap-y-6 border-t border-black/10 pt-6'
      }
    >
      {highlights.map((highlight) => (
        <div key={highlight.label}>
          <dt className="text-sm text-[var(--tp-ink-muted)]">{highlight.label}</dt>
          <dd className="mt-1 font-[family-name:var(--tp-font-heading)] text-2xl tracking-tight text-[var(--tp-primary)] [font-weight:var(--tp-heading-weight)]">
            {highlight.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function About({ section, ctx, family }: SectionComponentProps<'about'>): ReactElement {
  switch (section.variant) {
    case 'portrait':
      return (
        <div className={family.tokens.container}>
          <div className="grid items-center gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-16">
            {section.image ? (
              <Img
                image={section.image}
                ctx={ctx}
                className={`aspect-[4/5] w-full object-cover ${family.tokens.image}`}
              />
            ) : null}
            <div>
              <p className={family.tokens.kicker}>About us</p>
              <h2 className={family.tokens.heading}>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 leading-relaxed text-[var(--tp-ink-muted)]">
                  {paragraph}
                </p>
              ))}
              <Highlights highlights={section.highlights} />
            </div>
          </div>
        </div>
      )
    case 'story':
      return (
        <div className={family.tokens.container}>
          <div className="mx-auto max-w-2xl">
            <SectionHeader family={family} kicker="About us" heading={section.heading} />
            <div className="mt-8 space-y-5 text-left">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="leading-relaxed text-[var(--tp-ink-muted)]">
                  {paragraph}
                </p>
              ))}
            </div>
            <Highlights highlights={section.highlights} center={family.tokens.align === 'center'} />
          </div>
          {section.image ? (
            <Img
              image={section.image}
              ctx={ctx}
              className={`mx-auto mt-12 aspect-[16/7] w-full max-w-4xl object-cover ${family.tokens.image}`}
            />
          ) : null}
        </div>
      )
  }
}
