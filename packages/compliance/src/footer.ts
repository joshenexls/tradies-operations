/**
 * Legal footer for every outreach message. UK law requires marketing email
 * to identify the sender (PECR reg 23 bans disguised identity; Companies Act
 * 2006 / trading disclosure regs require registered name, number and office
 * on business emails) and to carry a valid opt-out address. The price is
 * included so no pitch can imply the service is free (CPRs/DMCC).
 */

export type LegalFooterInput = {
  tradingName: string
  companyName: string
  companyNumber: string
  registeredOffice: string
  /** e.g. '£19.99/month' */
  priceLine: string
  unsubscribeUrl: string
  privacyNoticeUrl: string
}

export function buildLegalFooter(input: LegalFooterInput): string {
  return [
    `${input.tradingName} is a trading name of ${input.companyName}, registered in England and` +
      ` Wales, company number ${input.companyNumber}.`,
    `Registered office: ${input.registeredOffice}.`,
    `The service costs ${input.priceLine} — no hidden extras.`,
    `Don't want to hear from us again? Unsubscribe in one click: ${input.unsubscribeUrl}` +
      ` (it applies to everything we send).`,
    `How we handle your data (privacy notice): ${input.privacyNoticeUrl}`,
  ].join('\n')
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildLegalFooterHtml(input: LegalFooterInput): string {
  const e = escapeHtml
  return [
    '<div style="font-size:12px;line-height:1.5;color:#555555">',
    `<p>${e(input.tradingName)} is a trading name of ${e(input.companyName)}, registered in` +
      ` England and Wales, company number ${e(input.companyNumber)}.</p>`,
    `<p>Registered office: ${e(input.registeredOffice)}.</p>`,
    `<p>The service costs ${e(input.priceLine)} — no hidden extras.</p>`,
    `<p>Don't want to hear from us again? <a href="${e(input.unsubscribeUrl)}">Unsubscribe in` +
      ` one click</a> (it applies to everything we send).</p>`,
    `<p><a href="${e(input.privacyNoticeUrl)}">How we handle your data (privacy notice)</a></p>`,
    '</div>',
  ].join('\n')
}

/**
 * Gate used by outreach tests: returns the legally required elements that are
 * missing from a rendered footer. An empty array means the footer is complete.
 */
export function validateLegalFooter(text: string, input: LegalFooterInput): string[] {
  const haystack = text.toLowerCase()
  const has = (needle: string): boolean => haystack.includes(needle.toLowerCase())

  const required: [value: string, label: string][] = [
    [input.tradingName, 'trading name'],
    [input.companyName, 'registered company name'],
    [input.companyNumber, 'company number'],
    [input.registeredOffice, 'registered office address'],
    [input.priceLine, 'price'],
    [input.unsubscribeUrl, 'unsubscribe link'],
    [input.privacyNoticeUrl, 'privacy notice link'],
  ]

  return required.filter(([value]) => !has(value)).map(([, label]) => label)
}
