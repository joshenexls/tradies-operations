import { describe, expect, it } from 'vitest'
import { validateSpecAgainstFacts } from './fact-guard'
import type { SiteSpec } from './site-spec'
import { makeFacts, makeValidSpec } from './test-helpers'

const NOW = new Date('2026-07-01T00:00:00Z')

function heroOf(spec: SiteSpec) {
  const hero = spec.sections[0]
  if (!hero || hero.kind !== 'hero') throw new Error('expected hero as first section')
  return hero
}

describe('FACT-GUARD', () => {
  it('passes a fully grounded spec', () => {
    const report = validateSpecAgainstFacts(makeValidSpec(), { now: NOW })
    expect(report.violations).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('blocks badges that are not evidenced accreditations', () => {
    const spec = makeValidSpec()
    heroOf(spec).badges = ['gas-safe', 'niceic'] // niceic not evidenced
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.ok).toBe(false)
    expect(report.violations.some((v) => v.code === 'unevidenced_badge')).toBe(true)
  })

  it('blocks establishment claims when no foundedYear is evidenced', () => {
    const spec = makeValidSpec(makeFacts({ foundedYear: undefined }))
    heroOf(spec).subheadline = 'Family plumbers established 1998, serving all of Leeds with pride.'
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'unevidenced_history')).toBe(true)
  })

  it('blocks establishment years that contradict the evidence', () => {
    const spec = makeValidSpec() // evidenced 2008
    heroOf(spec).subheadline = 'Proudly serving Leeds since 1998 with honest plumbing done right.'
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'history_mismatch')).toBe(true)
  })

  it('blocks "N years" claims exceeding what the founding year supports', () => {
    const spec = makeValidSpec() // 2008 → max 18 years at NOW
    heroOf(spec).subheadline = 'Over 30 years of plumbing experience across Leeds and beyond.'
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'history_mismatch')).toBe(true)
  })

  it('allows year counts the founding year supports', () => {
    const spec = makeValidSpec()
    heroOf(spec).subheadline = 'Over 15 years of plumbing experience across Leeds and beyond.'
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations).toEqual([])
  })

  it('blocks testimonial-shaped copy (the prompt-injection case)', () => {
    const spec = makeValidSpec()
    const about = {
      kind: 'about' as const,
      variant: 'story' as const,
      heading: 'What our customers say',
      paragraphs: [
        '“Absolutely brilliant service, fixed our boiler within the hour and left everything spotless” — Sarah, Headingley.',
      ],
      highlights: [],
    }
    spec.sections.splice(2, 0, about)
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'review_like_content')).toBe(true)
  })

  it('blocks star-rating language', () => {
    const spec = makeValidSpec()
    heroOf(spec).subheadline = 'Five star rated plumbing for homes across Leeds and West Yorkshire.'
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'review_like_content')).toBe(true)
  })

  it('blocks insurance/guarantee claims with no evidence, allows evidenced ones', () => {
    const bare = makeValidSpec(makeFacts({ claims: [] }))
    heroOf(bare).subheadline = 'Fully insured plumbing and heating work across the city of Leeds.'
    const bareReport = validateSpecAgainstFacts(bare, { now: NOW })
    expect(bareReport.violations.some((v) => v.code === 'unevidenced_claim')).toBe(true)

    const evidenced = makeValidSpec() // facts include "Fully insured up to £2m"
    heroOf(evidenced).subheadline =
      'Fully insured plumbing and heating work across the city of Leeds.'
    const evidencedReport = validateSpecAgainstFacts(evidenced, { now: NOW })
    expect(evidencedReport.violations).toEqual([])
  })

  it('blocks a displayed phone number that differs from the evidence', () => {
    const spec = makeValidSpec()
    spec.identity.phone = '0113 000 9999'
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'contact_mismatch')).toBe(true)
  })

  it('blocks service areas that are not in the facts sheet', () => {
    const spec = makeValidSpec()
    const area = spec.sections.find((s) => s.kind === 'serviceArea')
    if (area && area.kind === 'serviceArea') area.areas = ['Leeds', 'Manchester']
    const report = validateSpecAgainstFacts(spec, { now: NOW })
    expect(report.violations.some((v) => v.code === 'unknown_service_area')).toBe(true)
  })
})
