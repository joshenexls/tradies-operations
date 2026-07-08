/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps, TemplateFamily } from '../registry'
import { PhoneIcon } from '../icons'
import { LeadForm, telHref } from '../ui'

export function Contact({
  section,
  spec,
  ctx,
  family,
}: SectionComponentProps<'contact'>): ReactElement {
  const phone = spec.identity.phone
  const email = spec.identity.email
  const mapTitle = `Map showing ${spec.identity.businessName} in ${spec.identity.town}`

  switch (section.variant) {
    case 'split-form': {
      const details = (
        <div>
          <p className={family.tokens.kicker}>Get in touch</p>
          <h2 className={family.tokens.heading}>{section.heading}</h2>
          {section.blurb ? (
            <p className="mt-4 max-w-xl leading-relaxed text-[var(--tp-ink-muted)]">
              {section.blurb}
            </p>
          ) : null}
          {section.showPhone && phone ? (
            <div className="mt-8">
              <a
                href={telHref(phone)}
                className="inline-flex items-center gap-3 font-[family-name:var(--tp-font-heading)] text-3xl tracking-tight text-[var(--tp-primary)] [font-weight:var(--tp-heading-weight)] md:text-4xl"
              >
                <PhoneIcon className="h-7 w-7 shrink-0" />
                {phone}
              </a>
            </div>
          ) : null}
          {email ? (
            <p className="mt-3 text-[var(--tp-ink-muted)]">
              <a href={`mailto:${email}`} className="underline underline-offset-2">
                {email}
              </a>
            </p>
          ) : null}
          {section.hoursNote ? (
            <p className="mt-6 text-sm text-[var(--tp-ink-muted)]">{section.hoursNote}</p>
          ) : null}
          {ctx.location?.reviewsUrl ? (
            <div className="mt-6">
              <ReviewsLink href={ctx.location.reviewsUrl} family={family} />
            </div>
          ) : null}
          {ctx.location?.mapsEmbedSrc ? (
            <ContactMap src={ctx.location.mapsEmbedSrc} title={mapTitle} className="mt-8" />
          ) : null}
        </div>
      )
      if (!section.showLeadForm) {
        return (
          <div className={family.tokens.container}>
            <div className="mx-auto max-w-2xl">{details}</div>
          </div>
        )
      }
      return (
        <div className={family.tokens.container}>
          <div className="grid gap-12 md:grid-cols-[1fr_1.1fr] md:gap-16">
            {details}
            <LeadForm ctx={ctx} family={family} className={`${family.tokens.card} md:p-8`} />
          </div>
        </div>
      )
    }
    case 'banner':
      return (
        <div className={family.tokens.container}>
          <div className="rounded-[var(--tp-radius)] bg-[var(--tp-primary)] px-6 py-12 text-center md:px-14 md:py-16">
            <h2 className="text-balance font-[family-name:var(--tp-font-heading)] text-3xl tracking-tight text-[var(--tp-on-primary)] [font-weight:var(--tp-heading-weight)] md:text-4xl">
              {section.heading}
            </h2>
            {section.blurb ? (
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-[var(--tp-on-primary)]/85">
                {section.blurb}
              </p>
            ) : null}
            {section.showPhone && phone ? (
              <div className="mt-8">
                <a
                  href={telHref(phone)}
                  className="inline-flex items-center gap-3 font-[family-name:var(--tp-font-heading)] text-3xl tracking-tight text-[var(--tp-on-primary)] [font-weight:var(--tp-heading-weight)] md:text-4xl"
                >
                  <PhoneIcon className="h-7 w-7 shrink-0" />
                  {phone}
                </a>
              </div>
            ) : null}
            {email ? (
              <p className="mt-3 text-sm text-[var(--tp-on-primary)]/80">
                <a href={`mailto:${email}`} className="underline underline-offset-2">
                  {email}
                </a>
              </p>
            ) : null}
            {section.hoursNote ? (
              <p className="mt-4 text-sm text-[var(--tp-on-primary)]/75">{section.hoursNote}</p>
            ) : null}
            {ctx.location?.reviewsUrl ? (
              <div className="mt-8">
                <ReviewsLink href={ctx.location.reviewsUrl} family={family} onDark />
              </div>
            ) : null}
            {section.showLeadForm ? (
              <LeadForm
                ctx={ctx}
                family={family}
                onDark
                className="mx-auto mt-10 max-w-xl text-left"
              />
            ) : null}
            {ctx.location?.mapsEmbedSrc ? (
              <ContactMap
                src={ctx.location.mapsEmbedSrc}
                title={mapTitle}
                onDark
                className="mx-auto mt-10 max-w-2xl"
              />
            ) : null}
          </div>
        </div>
      )
  }
}

/**
 * Keyless, plain (non-sandboxed) Google Maps embed. A sandbox attribute breaks
 * Google Maps, and no allow/referrerPolicy is needed — the map query is plain
 * text so it renders for every site, place id or not.
 */
function ContactMap({
  src,
  title,
  onDark = false,
  className,
}: {
  src: string
  title: string
  onDark?: boolean
  className?: string
}): ReactElement {
  return (
    <div
      className={`overflow-hidden rounded-[var(--tp-radius)] border ${
        onDark ? 'border-white/25' : 'border-black/10'
      } ${className ?? ''}`}
    >
      <iframe
        src={src}
        title={title}
        loading="lazy"
        className="block aspect-video w-full border-0"
      />
    </div>
  )
}

/**
 * Compliant social proof: a fixed-label link to the business's own real Google
 * listing. The label is a CONSTANT string — never a rating, star count or
 * number — so the review-pattern scanner can never see a fabricated claim.
 */
function ReviewsLink({
  href,
  family,
  onDark = false,
}: {
  href: string
  family: TemplateFamily
  onDark?: boolean
}): ReactElement {
  const cls = onDark
    ? 'inline-flex items-center justify-center gap-2 rounded-[var(--tp-radius)] bg-[var(--tp-surface)] px-6 py-3 font-semibold text-[var(--tp-primary)] transition-opacity hover:opacity-90'
    : family.tokens.ctaGhost
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[0.7rem] font-bold leading-none"
      >
        G
      </span>
      See our reviews on Google
    </a>
  )
}
