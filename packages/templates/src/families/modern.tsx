/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import { ACCREDITATION_LABELS, TRADE_LABELS } from '@tradies/site-spec'
import type { FamilyChrome, TemplateFamily } from '../registry'
import { PhoneIcon } from '../icons'
import { CreditSlot, telHref } from '../ui'

/**
 * Modern — clean/confident. Sticky translucent header, asymmetric layouts,
 * large type, rounded cards and soft shadows.
 */

function ModernHeader({ spec }: FamilyChrome): ReactElement {
  const { identity } = spec
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[var(--tp-surface)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 md:px-6">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--tp-font-heading)] text-lg text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-xl">
            {identity.businessName}
          </p>
          {identity.strapline ? (
            <p className="hidden truncate text-xs text-[var(--tp-ink-muted)] sm:block">
              {identity.strapline}
            </p>
          ) : null}
        </div>
        {identity.phone ? (
          <a
            href={telHref(identity.phone)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--tp-primary)] px-4 py-2 text-sm font-semibold text-[var(--tp-on-primary)] shadow-md shadow-black/10 transition-opacity hover:opacity-90 md:px-5 md:text-base"
          >
            <PhoneIcon className="h-4 w-4" />
            {identity.phone}
          </a>
        ) : null}
      </div>
    </header>
  )
}

function ModernFooter({ spec, ctx }: FamilyChrome): ReactElement {
  const { identity, facts } = spec
  const labels = facts.accreditations.map((a) => ACCREDITATION_LABELS[a.id])
  return (
    <footer className="border-t border-black/5 bg-[var(--tp-surface-alt)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-3 md:px-6">
        <div>
          <p className="font-[family-name:var(--tp-font-heading)] text-xl text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)]">
            {identity.businessName}
          </p>
          {identity.strapline ? (
            <p className="mt-2 text-sm text-[var(--tp-ink-muted)]">{identity.strapline}</p>
          ) : null}
          <p className="mt-2 text-sm text-[var(--tp-ink-muted)]">
            {TRADE_LABELS[identity.trade]} · {identity.town}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--tp-ink)]">Contact</p>
          {identity.phone ? (
            <a
              href={telHref(identity.phone)}
              className="mt-3 block text-lg font-semibold text-[var(--tp-primary)]"
            >
              {identity.phone}
            </a>
          ) : null}
          {identity.email ? (
            <a
              href={`mailto:${identity.email}`}
              className="mt-1 block text-sm text-[var(--tp-ink-muted)] hover:text-[var(--tp-ink)]"
            >
              {identity.email}
            </a>
          ) : null}
        </div>
        {labels.length > 0 ? (
          <div>
            <p className="text-sm font-semibold text-[var(--tp-ink)]">Accreditations</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {labels.map((label) => (
                <li
                  key={label}
                  className="rounded-full bg-[var(--tp-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--tp-primary)]"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="border-t border-black/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-[var(--tp-ink-muted)] md:px-6">
          <span>
            {identity.businessName} · {identity.town}
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {ctx.privacyNoticeUrl ? (
              <a href={ctx.privacyNoticeUrl} className="underline underline-offset-2">
                Privacy notice
              </a>
            ) : null}
            <CreditSlot ctx={ctx} />
          </div>
        </div>
      </div>
    </footer>
  )
}

export const modernFamily: TemplateFamily = {
  id: 'modern',
  name: 'Modern',
  Header: ModernHeader,
  Footer: ModernFooter,
  sectionFrame: (kind, index) => {
    if (kind === 'hero') return ''
    return index % 2 === 1
      ? 'bg-[var(--tp-surface-alt)] py-20 md:py-28'
      : 'bg-[var(--tp-surface)] py-20 md:py-28'
  },
  tokens: {
    container: 'mx-auto max-w-6xl px-4 md:px-6',
    align: 'left',
    headerWrap: 'max-w-2xl',
    kicker: 'mb-3 text-sm font-semibold text-[var(--tp-primary)]',
    heading:
      'text-balance font-[family-name:var(--tp-font-heading)] text-3xl tracking-tight text-[var(--tp-ink)] [font-weight:var(--tp-heading-weight)] md:text-4xl lg:text-[2.6rem] lg:leading-[1.15]',
    intro: 'mt-4 max-w-xl text-lg leading-relaxed text-[var(--tp-ink-muted)]',
    contentGap: 'mt-12 md:mt-16',
    card: 'rounded-[var(--tp-radius)] bg-[var(--tp-surface)] p-6 shadow-lg shadow-black/5 ring-1 ring-black/5',
    chip: 'rounded-full bg-[var(--tp-primary)]/10 px-4 py-1.5 text-sm font-medium text-[var(--tp-primary)]',
    badge:
      'inline-flex items-center gap-1.5 rounded-full bg-[var(--tp-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--tp-primary)]',
    iconBox:
      'flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--tp-radius)] bg-[var(--tp-primary)]/10 text-[var(--tp-primary)]',
    cta: 'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--tp-primary)] px-6 py-3 font-semibold text-[var(--tp-on-primary)] shadow-md shadow-black/10 transition-opacity hover:opacity-90',
    ctaGhost:
      'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-[var(--tp-primary)] ring-1 ring-[var(--tp-primary)]/30 transition-colors hover:bg-[var(--tp-primary)]/10',
    label: 'mb-1.5 block text-sm font-medium text-[var(--tp-ink)]',
    input:
      'w-full rounded-[var(--tp-radius)] bg-[var(--tp-surface)] px-3.5 py-2.5 text-[var(--tp-ink)] ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--tp-primary)]',
    image: 'rounded-[var(--tp-radius)] shadow-xl shadow-black/10',
  },
}
