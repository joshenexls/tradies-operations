/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { AccreditationId, ImageRef } from '@tradies/site-spec'
import { ACCREDITATION_LABELS } from '@tradies/site-spec'
import type { TemplateContext } from './context'
import type { TemplateFamily } from './registry'
import { CheckIcon } from './icons'

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

export function Img({
  image,
  ctx,
  className,
  priority = false,
}: {
  image: ImageRef
  ctx: TemplateContext
  className?: string
  priority?: boolean
}): ReactElement {
  const resolved = ctx.resolveImage(image)
  return (
    <img
      src={resolved.src}
      width={resolved.width}
      height={resolved.height}
      alt={image.alt}
      loading={priority ? 'eager' : 'lazy'}
      className={className}
    />
  )
}

export function SectionHeader({
  family,
  kicker,
  heading,
  intro,
}: {
  family: TemplateFamily
  kicker?: string
  heading?: string
  intro?: string
}): ReactElement | null {
  if (!heading) return null
  return (
    <div className={family.tokens.headerWrap}>
      {kicker ? <p className={family.tokens.kicker}>{kicker}</p> : null}
      <h2 className={family.tokens.heading}>{heading}</h2>
      {intro ? <p className={family.tokens.intro}>{intro}</p> : null}
    </div>
  )
}

export function BadgeList({
  ids,
  family,
  center = false,
  onDark = false,
}: {
  ids: readonly AccreditationId[]
  family: TemplateFamily
  center?: boolean
  onDark?: boolean
}): ReactElement | null {
  if (ids.length === 0) return null
  const badge = onDark
    ? 'inline-flex items-center gap-1.5 rounded-[var(--tp-radius)] border border-white/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white'
    : family.tokens.badge
  return (
    <ul
      className={
        center
          ? 'flex flex-wrap items-center justify-center gap-2.5'
          : 'flex flex-wrap items-center gap-2.5'
      }
    >
      {ids.map((id) => (
        <li key={id} className={badge}>
          <CheckIcon className="h-3.5 w-3.5 shrink-0" />
          {ACCREDITATION_LABELS[id]}
        </li>
      ))}
    </ul>
  )
}

/** Phase-4 injects the live credit; previews show the operator immediately. */
export function CreditSlot({ ctx }: { ctx: TemplateContext }): ReactElement {
  return (
    <span data-credit-slot="">
      {ctx.previewBanner ? `Website by ${ctx.previewBanner.operatorName}` : null}
    </span>
  )
}

export function LeadForm({
  ctx,
  family,
  onDark = false,
  className,
}: {
  ctx: TemplateContext
  family: TemplateFamily
  onDark?: boolean
  className?: string
}): ReactElement {
  const label = onDark
    ? 'mb-1.5 block text-sm font-medium text-[var(--tp-on-primary)]'
    : family.tokens.label
  const input = onDark
    ? 'w-full rounded-[var(--tp-radius)] border border-white/30 bg-white/10 px-3.5 py-2.5 text-[var(--tp-on-primary)] focus:border-white focus:outline-none'
    : family.tokens.input
  const submit = onDark
    ? 'inline-flex items-center justify-center gap-2 rounded-[var(--tp-radius)] bg-[var(--tp-surface)] px-6 py-3 font-semibold text-[var(--tp-primary)] transition-opacity hover:opacity-90'
    : family.tokens.cta
  return (
    <form method="post" action={ctx.leadFormAction} className={className}>
      <input type="hidden" name="intent" value="lead" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-name" className={label}>
            Your name
          </label>
          <input
            id="lead-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className={input}
          />
        </div>
        <div>
          <label htmlFor="lead-phone" className={label}>
            Phone number
          </label>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            className={input}
          />
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor="lead-message" className={label}>
          How can we help?
        </label>
        <textarea id="lead-message" name="message" rows={4} required className={input} />
      </div>
      <button type="submit" className={`mt-6 w-full ${submit}`}>
        Send your enquiry
      </button>
      {ctx.privacyNoticeUrl ? (
        <p
          className={
            onDark
              ? 'mt-3 text-xs text-[var(--tp-on-primary)]/70'
              : 'mt-3 text-xs text-[var(--tp-ink-muted)]'
          }
        >
          We only use your details to reply to this enquiry.{' '}
          <a href={ctx.privacyNoticeUrl} className="underline underline-offset-2">
            Privacy notice
          </a>
        </p>
      ) : null}
    </form>
  )
}
