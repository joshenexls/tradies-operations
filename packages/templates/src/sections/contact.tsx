/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement } from 'react'
import type { SectionComponentProps } from '../registry'
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
            {section.showLeadForm ? (
              <LeadForm
                ctx={ctx}
                family={family}
                onDark
                className="mx-auto mt-10 max-w-xl text-left"
              />
            ) : null}
          </div>
        </div>
      )
  }
}
