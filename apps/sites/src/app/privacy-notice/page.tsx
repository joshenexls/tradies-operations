import { buildArt14Notice } from '@tradies/compliance'

export const metadata = {
  title: 'Privacy notice',
  robots: { index: false, follow: false },
}

/**
 * GDPR Art-14 notice — linked from every first-contact message and every
 * preview footer (we process business contact data we did not collect from
 * the data subject directly).
 */
export default function PrivacyNoticePage() {
  const markdown = buildArt14Notice({
    controllerName: process.env.OPERATOR_LEGAL_NAME ?? 'Tradies Studio Ltd',
    contactEmail: process.env.OPERATOR_CONTACT_EMAIL ?? 'privacy@tradies.co.uk',
    sources: [
      'Overture Maps Foundation open data',
      'Companies House public register',
      "the business's own public website",
      'information you provide to us directly',
    ],
  })
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-sans">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{markdown}</pre>
    </main>
  )
}
