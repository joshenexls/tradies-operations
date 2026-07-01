/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import { ACCREDITATION_LABELS, TRADE_LABELS } from '@tradies/site-spec'
import type { FamilyChrome, TemplateFamily } from '../registry'
import { PhoneIcon } from '../icons'
import { CreditSlot, telHref } from '../ui'

/**
 * Bold — high-impact. Dark blocked header with an accent strip, oversized
 * uppercase headings, hard edges, strong color blocking, chunky CTAs.
 */

function BoldHeader({ spec }: FamilyChrome): ReactElement {
  const { identity } = spec
  return (
    <header className="bg-[var(--tp-ink)]">
      <div className="h-1 bg-[var(--tp-accent)]" aria-hidden="true" />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-4 md:px-8 md:py-5">
        <div>
          <p className="font-[family-name:var(--tp-font-heading)] text-xl uppercase tracking-tight text-white [font-weight:var(--tp-heading-weight)] md:text-2xl">
            {identity.businessName}
          </p>
          {identity.strapline ? (
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
              {identity.strapline}
            </p>
          ) : null}
        </div>
        {identity.phone ? (
          <a
            href={telHref(identity.phone)}
            className="inline-flex items-center gap-2.5 bg-white px-5 py-3 text-sm font-bold uppercase tracking-wide text-[var(--tp-ink)] transition-transform hover:-translate-y-0.5 md:px-6 md:text-base"
          >
            <PhoneIcon className="h-4.5 w-4.5" />
            {identity.phone}
          </a>
        ) : null}
      </div>
    </header>
  )
}

function BoldFooter({ spec, ctx }: FamilyChrome): ReactElement {
  const { identity, facts } = spec
  const labels = facts.accreditations.map((a) => ACCREDITATION_LABELS[a.id])
  return (
    <footer className="bg-[var(--tp-ink)] text-white">
      <div className="h-1 bg-[var(--tp-accent)]" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-x-12 gap-y-8">
          <div>
            <p className="font-[family-name:var(--tp-font-heading)] text-2xl uppercase tracking-tight [font-weight:var(--tp-heading-weight)]">
              {identity.businessName}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {TRADE_LABELS[identity.trade]} · {identity.town}
            </p>
          </div>
          <div>
            {identity.phone ? (
              <a href={telHref(identity.phone)} className="block text-xl font-bold text-white">
                {identity.phone}
              </a>
            ) : null}
            {identity.email ? (
              <a
                href={`mailto:${identity.email}`}
                className="mt-1 block text-sm text-white/70 hover:text-white"
              >
                {identity.email}
              </a>
            ) : null}
          </div>
        </div>
        {labels.length > 0 ? (
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.18em] text-white/50">
            {labels.join('  /  ')}
          </p>
        ) : null}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-white/60">
          {ctx.privacyNoticeUrl ? (
            <a href={ctx.privacyNoticeUrl} className="underline underline-offset-2">
              Privacy notice
            </a>
          ) : null}
          <CreditSlot ctx={ctx} />
        </div>
      </div>
    </footer>
  )
}

export const boldFamily: TemplateFamily = {
  id: 'bold',
  name: 'Bold',
  Header: BoldHeader,
  Footer: BoldFooter,
  sectionFrame: (kind, index) => {
    if (kind === 'hero') return ''
    return index % 2 === 1
      ? 'bg-[var(--tp-surface-alt)] py-16 md:py-24'
      : 'bg-[var(--tp-surface)] py-16 md:py-24'
  },
  tokens: {
    container: 'mx-auto max-w-7xl px-4 md:px-8',
    align: 'left',
    headerWrap: 'max-w-3xl',
    kicker:
      'mb-4 inline-block border-l-4 border-[var(--tp-accent)] pl-3 text-sm font-bold uppercase tracking-[0.18em] text-[var(--tp-primary)]',
    heading:
      'font-[family-name:var(--tp-font-heading)] text-4xl uppercase leading-[1.05] tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-5xl',
    intro: 'mt-5 max-w-2xl text-lg leading-relaxed text-[var(--tp-ink-muted)]',
    contentGap: 'mt-12 md:mt-16',
    card: 'border-2 border-[var(--tp-ink)] bg-[var(--tp-surface)] p-6',
    chip: 'border-2 border-[var(--tp-ink)] px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-[var(--tp-ink)]',
    badge:
      'inline-flex items-center gap-1.5 bg-[var(--tp-ink)] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white',
    iconBox: 'flex h-11 w-11 shrink-0 items-center justify-center bg-[var(--tp-ink)] text-white',
    cta: 'inline-flex items-center justify-center gap-2 bg-[var(--tp-primary)] px-8 py-4 font-bold uppercase tracking-wide text-[var(--tp-on-primary)] transition-transform hover:-translate-y-0.5',
    ctaGhost:
      'inline-flex items-center justify-center gap-2 border-2 border-[var(--tp-ink)] px-8 py-4 font-bold uppercase tracking-wide text-[var(--tp-ink)] transition-colors hover:bg-[var(--tp-ink)] hover:text-white',
    label: 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--tp-ink)]',
    input:
      'w-full border-2 border-[var(--tp-ink)]/25 bg-[var(--tp-surface)] px-3.5 py-2.5 text-[var(--tp-ink)] focus:border-[var(--tp-ink)] focus:outline-none',
    image: 'border-2 border-[var(--tp-ink)]',
  },
}
