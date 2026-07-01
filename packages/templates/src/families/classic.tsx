/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import { ACCREDITATION_LABELS, TRADE_LABELS } from '@tradies/site-spec'
import type { FamilyChrome, TemplateFamily } from '../registry'
import { PhoneIcon } from '../icons'
import { CreditSlot, telHref } from '../ui'

/**
 * Classic — heritage/established. Centred masthead with the phone prominent,
 * serif-friendly headings, generous whitespace, hairline borders, alternating
 * bands with a subtle top rule.
 */

function ClassicHeader({ spec }: FamilyChrome): ReactElement {
  const { identity } = spec
  return (
    <header className="border-b border-black/10 bg-[var(--tp-surface)]">
      <div className="border-b border-black/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-xs uppercase tracking-[0.14em] text-[var(--tp-ink-muted)] md:px-6">
          <span>
            {TRADE_LABELS[identity.trade]} · {identity.town}
          </span>
          {identity.email ? (
            <a
              href={`mailto:${identity.email}`}
              className="normal-case tracking-normal hover:text-[var(--tp-ink)]"
            >
              {identity.email}
            </a>
          ) : null}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 text-center md:px-6 md:py-10">
        <p className="font-[family-name:var(--tp-font-heading)] text-3xl tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-4xl">
          {identity.businessName}
        </p>
        {identity.strapline ? (
          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-[var(--tp-ink-muted)]">
            {identity.strapline}
          </p>
        ) : null}
        {identity.phone ? (
          <a
            href={telHref(identity.phone)}
            className="mt-5 inline-flex items-center gap-2.5 rounded-[var(--tp-radius)] border border-[var(--tp-primary)] px-6 py-2.5 text-lg font-semibold text-[var(--tp-primary)] transition-colors hover:bg-[var(--tp-primary)] hover:text-[var(--tp-on-primary)]"
          >
            <PhoneIcon className="h-5 w-5" />
            {identity.phone}
          </a>
        ) : null}
      </div>
    </header>
  )
}

function ClassicFooter({ spec, ctx }: FamilyChrome): ReactElement {
  const { identity, facts } = spec
  const labels = facts.accreditations.map((a) => ACCREDITATION_LABELS[a.id])
  return (
    <footer className="border-t border-black/10 bg-[var(--tp-surface-alt)]">
      <div className="mx-auto max-w-6xl px-4 py-14 text-center md:px-6">
        <p className="font-[family-name:var(--tp-font-heading)] text-2xl tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)]">
          {identity.businessName}
        </p>
        <p className="mt-1 text-sm text-[var(--tp-ink-muted)]">
          {TRADE_LABELS[identity.trade]} in {identity.town}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {identity.phone ? (
            <a href={telHref(identity.phone)} className="font-semibold text-[var(--tp-primary)]">
              {identity.phone}
            </a>
          ) : null}
          {identity.email ? (
            <a
              href={`mailto:${identity.email}`}
              className="text-[var(--tp-ink-muted)] hover:text-[var(--tp-ink)]"
            >
              {identity.email}
            </a>
          ) : null}
        </div>
        {labels.length > 0 ? (
          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-[var(--tp-ink-muted)]">
            {labels.join(' · ')}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-black/10 pt-6 text-xs text-[var(--tp-ink-muted)]">
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

export const classicFamily: TemplateFamily = {
  id: 'classic',
  name: 'Classic',
  Header: ClassicHeader,
  Footer: ClassicFooter,
  sectionFrame: (kind, index) => {
    if (kind === 'hero') return ''
    return index % 2 === 1
      ? 'border-t border-black/5 bg-[var(--tp-surface-alt)] py-20 md:py-28'
      : 'border-t border-black/5 bg-[var(--tp-surface)] py-20 md:py-28'
  },
  tokens: {
    container: 'mx-auto max-w-6xl px-4 md:px-6',
    align: 'center',
    headerWrap: 'mx-auto max-w-2xl text-center',
    kicker: 'mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--tp-primary)]',
    heading:
      'text-balance font-[family-name:var(--tp-font-heading)] text-3xl tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-4xl',
    intro: 'mx-auto mt-4 max-w-xl leading-relaxed text-[var(--tp-ink-muted)]',
    contentGap: 'mt-12 md:mt-16',
    card: 'rounded-[var(--tp-radius)] border border-black/10 bg-[var(--tp-surface)] p-6',
    chip: 'rounded-[var(--tp-radius)] border border-black/10 bg-[var(--tp-surface)] px-4 py-1.5 text-sm text-[var(--tp-ink)]',
    badge:
      'inline-flex items-center gap-1.5 rounded-[var(--tp-radius)] border border-black/10 bg-[var(--tp-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--tp-ink)]',
    iconBox:
      'flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--tp-radius)] border border-black/10 text-[var(--tp-primary)]',
    cta: 'inline-flex items-center justify-center gap-2 rounded-[var(--tp-radius)] bg-[var(--tp-primary)] px-6 py-3 font-semibold text-[var(--tp-on-primary)] transition-opacity hover:opacity-90',
    ctaGhost:
      'inline-flex items-center justify-center gap-2 rounded-[var(--tp-radius)] border border-[var(--tp-primary)] px-6 py-3 font-semibold text-[var(--tp-primary)] transition-colors hover:bg-[var(--tp-primary)] hover:text-[var(--tp-on-primary)]',
    label: 'mb-1.5 block text-sm font-medium text-[var(--tp-ink)]',
    input:
      'w-full rounded-[var(--tp-radius)] border border-black/15 bg-[var(--tp-surface)] px-3.5 py-2.5 text-[var(--tp-ink)] focus:border-[var(--tp-primary)] focus:outline-none',
    image: 'rounded-[var(--tp-radius)] border border-black/10',
  },
}
