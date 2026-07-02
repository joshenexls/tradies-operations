import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { applyAnnotations } from './annotate'
import { sanitizeHtml } from './sanitize'
import { validateAnnotatedTemplate } from './validate-template'
import { MINI_LANDER, MINI_LANDER_OPS } from './test-fixtures'

const sanitized = sanitizeHtml(MINI_LANDER).html
const annotated = applyAnnotations(sanitized, MINI_LANDER_OPS)

describe('validateAnnotatedTemplate', () => {
  it('passes a valid annotated fixture', () => {
    const result = validateAnnotatedTemplate(annotated.annotatedHtml, annotated.manifest)
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('flags a manifest slot that no longer resolves', () => {
    const $ = load(annotated.annotatedHtml)
    $('[data-slot="hero-sub"]').removeAttr('data-slot')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('slot "hero-sub" resolves to 0 elements (expected exactly 1)')
  })

  it('flags leftover [data-strip] remnants', () => {
    const $ = load(annotated.annotatedHtml)
    $('.faq').attr('data-strip', 'testimonials')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('[data-strip] remnants'))).toBe(true)
  })

  it('flags a second h1', () => {
    const $ = load(annotated.annotatedHtml)
    $('.faq').append('<h1>Another heading</h1>')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('template has 2 <h1> elements (expected exactly 1)')
  })

  it('flags unstripped review-shaped copy outside slots, with the snippet', () => {
    // annotate WITHOUT the strip op: the dummy testimonials block stays behind
    const ops = MINI_LANDER_OPS.filter((op) => op.op !== 'strip')
    const unstripped = applyAnnotations(sanitized, ops)
    const result = validateAnnotatedTemplate(unstripped.annotatedHtml, unstripped.manifest)
    expect(result.ok).toBe(false)
    const reviewProblems = result.problems.filter((p) =>
      p.startsWith('review-shaped content outside any slot:'),
    )
    expect(reviewProblems.length).toBeGreaterThan(0)
    expect(reviewProblems.join('\n')).toContain('Amazing work')
  })

  it('flags review-shaped headings too', () => {
    const ops = MINI_LANDER_OPS.filter((op) => op.op !== 'strip')
    const unstripped = applyAnnotations(sanitized, ops)
    const $ = load(unstripped.annotatedHtml)
    $('.testimonials blockquote').remove()
    const result = validateAnnotatedTemplate($.html(), unstripped.manifest)
    expect(result.problems.some((p) => p.includes('What our customers say'))).toBe(true)
  })

  it('re-runs the sanitizer detectors', () => {
    const $ = load(annotated.annotatedHtml)
    $('body').append('<script src="https://tracker.evil.example/late.js"></script>')
    $('form').attr('action', 'https://evil.example/submit')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(result.ok).toBe(false)
    expect(
      result.problems.some((p) => p.includes('script-src: https://tracker.evil.example/late.js')),
    ).toBe(true)
    expect(result.problems.some((p) => p.includes('form-action:'))).toBe(true)
  })

  it('flags a missing lead form when the manifest declares one', () => {
    const $ = load(annotated.annotatedHtml)
    $('form[data-form="lead"]').removeAttr('data-form')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(result.problems.some((p) => p.includes('declares a lead form but found 0'))).toBe(true)
  })

  it('flags a broken repeat template', () => {
    const $ = load(annotated.annotatedHtml)
    $('[data-repeat-item]').removeAttr('data-repeat-item')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(
      result.problems.some((p) =>
        p.includes('repeat "services" has 0 [data-repeat-item] templates'),
      ),
    ).toBe(true)
  })

  it('flags a missing standalone image', () => {
    const $ = load(annotated.annotatedHtml)
    $('img[data-slot-img="hero-image"]').removeAttr('data-slot-img')
    const result = validateAnnotatedTemplate($.html(), annotated.manifest)
    expect(result.problems.some((p) => p.includes('image "hero-image" resolves to 0'))).toBe(true)
  })
})
