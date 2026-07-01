/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import { TRADE_LABELS } from '@tradies/site-spec'
import type { SectionComponentProps } from '../registry'
import { PhoneIcon } from '../icons'
import { BadgeList, Img, telHref } from '../ui'

export function Hero({ section, spec, ctx, family }: SectionComponentProps<'hero'>): ReactElement {
  const { identity } = spec
  const kicker = `${TRADE_LABELS[identity.trade]} · ${identity.town}`
  const phone = identity.phone

  switch (section.variant) {
    case 'classic':
      return (
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className={family.tokens.kicker}>{kicker}</p>
            <h1 className="text-balance font-[family-name:var(--tp-font-heading)] text-4xl tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-5xl">
              {section.headline}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--tp-ink-muted)]">
              {section.subheadline}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="#contact" className={family.tokens.cta}>
                {section.ctaLabel}
              </a>
              {phone ? (
                <a href={telHref(phone)} className={family.tokens.ctaGhost}>
                  <PhoneIcon className="h-4.5 w-4.5" />
                  {phone}
                </a>
              ) : null}
            </div>
            {section.badges.length > 0 ? (
              <div className="mt-8">
                <BadgeList ids={section.badges} family={family} center />
              </div>
            ) : null}
          </div>
          <Img
            image={section.image}
            ctx={ctx}
            priority
            className={`mt-12 aspect-[21/9] w-full object-cover ${family.tokens.image}`}
          />
        </div>
      )
    case 'split':
      return (
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:px-6 md:pb-24 md:pt-20">
          <div>
            <p className={family.tokens.kicker}>{kicker}</p>
            <h1 className="text-balance font-[family-name:var(--tp-font-heading)] text-4xl tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
              {section.headline}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--tp-ink-muted)]">
              {section.subheadline}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#contact" className={family.tokens.cta}>
                {section.ctaLabel}
              </a>
              {phone ? (
                <a href={telHref(phone)} className={family.tokens.ctaGhost}>
                  <PhoneIcon className="h-4.5 w-4.5" />
                  {phone}
                </a>
              ) : null}
            </div>
            {section.badges.length > 0 ? (
              <div className="mt-8">
                <BadgeList ids={section.badges} family={family} />
              </div>
            ) : null}
          </div>
          <Img
            image={section.image}
            ctx={ctx}
            priority
            className={`aspect-[4/5] w-full object-cover ${family.tokens.image}`}
          />
        </div>
      )
    case 'overlay':
      return (
        <div className="relative isolate overflow-hidden bg-[var(--tp-ink)]">
          <Img
            image={section.image}
            ctx={ctx}
            priority
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60"
          />
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/35 to-black/10"
            aria-hidden="true"
          />
          <div className="mx-auto flex min-h-[72vh] max-w-6xl flex-col items-start justify-center px-4 py-24 md:px-6 md:py-32">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-white/75">{kicker}</p>
            <h1 className="mt-4 max-w-3xl text-balance font-[family-name:var(--tp-font-heading)] text-4xl leading-[1.05] tracking-tight text-white [font-weight:var(--tp-heading-weight)] sm:text-5xl md:text-6xl">
              {section.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85">
              {section.subheadline}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="#contact" className={family.tokens.cta}>
                {section.ctaLabel}
              </a>
              {phone ? (
                <a
                  href={telHref(phone)}
                  className="inline-flex items-center gap-2 py-3 font-semibold text-white underline-offset-4 hover:underline"
                >
                  <PhoneIcon className="h-4.5 w-4.5" />
                  {phone}
                </a>
              ) : null}
            </div>
            {section.badges.length > 0 ? (
              <div className="mt-10">
                <BadgeList ids={section.badges} family={family} onDark />
              </div>
            ) : null}
          </div>
        </div>
      )
  }
}
