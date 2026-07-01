import { describe, expect, it } from 'vitest'
import type { LegalFooterInput } from './footer'
import { buildLegalFooter, buildLegalFooterHtml, validateLegalFooter } from './footer'

const INPUT: LegalFooterInput = {
  tradingName: 'Yorkshire Trade Sites',
  companyName: 'Enex Software Ltd',
  companyNumber: '09876543',
  registeredOffice: '4 Bank Street, Leeds LS1 1AA',
  priceLine: '£19.99/month',
  unsubscribeUrl: 'https://example.com/u/abc123',
  privacyNoticeUrl: 'https://example.com/privacy',
}

describe('buildLegalFooter', () => {
  it('contains every legally required element', () => {
    const footer = buildLegalFooter(INPUT)
    expect(footer).toContain(INPUT.tradingName)
    expect(footer).toContain(INPUT.companyName)
    expect(footer).toContain(INPUT.companyNumber)
    expect(footer).toContain(INPUT.registeredOffice)
    expect(footer).toContain(INPUT.priceLine)
    expect(footer).toContain(INPUT.unsubscribeUrl)
    expect(footer).toContain(INPUT.privacyNoticeUrl)
    expect(footer.toLowerCase()).toContain('unsubscribe')
  })

  it('passes its own validation gate', () => {
    expect(validateLegalFooter(buildLegalFooter(INPUT), INPUT)).toEqual([])
  })
})

describe('buildLegalFooterHtml', () => {
  it('contains every element and working links', () => {
    const html = buildLegalFooterHtml(INPUT)
    expect(validateLegalFooter(html, INPUT)).toEqual([])
    expect(html).toContain(`<a href="${INPUT.unsubscribeUrl}">`)
    expect(html).toContain(`<a href="${INPUT.privacyNoticeUrl}">`)
  })

  it('escapes HTML in inputs', () => {
    const html = buildLegalFooterHtml({ ...INPUT, companyName: 'Enex <Software> & Co Ltd' })
    expect(html).not.toContain('<Software>')
    expect(html).toContain('Enex &lt;Software&gt; &amp; Co Ltd')
  })
})

describe('validateLegalFooter', () => {
  const removals: [key: keyof LegalFooterInput, label: string][] = [
    ['tradingName', 'trading name'],
    ['companyName', 'registered company name'],
    ['companyNumber', 'company number'],
    ['registeredOffice', 'registered office address'],
    ['priceLine', 'price'],
    ['unsubscribeUrl', 'unsubscribe link'],
    ['privacyNoticeUrl', 'privacy notice link'],
  ]

  for (const [key, label] of removals) {
    it(`catches a footer missing the ${label}`, () => {
      const gutted = buildLegalFooter(INPUT).split(INPUT[key]).join('')
      const missing = validateLegalFooter(gutted, INPUT)
      expect(missing).toContain(label)
      expect(missing).toHaveLength(1)
    })
  }

  it('reports everything missing for an empty footer', () => {
    expect(validateLegalFooter('', INPUT)).toHaveLength(removals.length)
  })
})
