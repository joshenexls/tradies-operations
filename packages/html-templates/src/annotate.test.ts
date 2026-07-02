import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { applyAnnotations, deriveMaxLength } from './annotate'
import { sanitizeHtml } from './sanitize'
import { MINI_LANDER, MINI_LANDER_OPS } from './test-fixtures'

const ANNOTATION_ATTRS = [
  'data-slot',
  'data-slot-kind',
  'data-repeat',
  'data-repeat-item',
  'data-slot-img',
  'data-form',
  'data-phone-href',
]

const collapse = (html: string) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()

function stripAnnotations(html: string): string {
  const $ = load(html)
  for (const attr of ANNOTATION_ATTRS) {
    $(`[${attr}]`).removeAttr(attr)
  }
  return collapse($.html())
}

const sanitized = sanitizeHtml(MINI_LANDER).html
const result = applyAnnotations(sanitized, MINI_LANDER_OPS)
const $ = load(result.annotatedHtml)

describe('applyAnnotations', () => {
  it('annotates slots with data-slot/data-slot-kind', () => {
    expect($('[data-slot="hero-headline"]').attr('data-slot-kind')).toBe('headline')
    expect($('h1[data-slot="hero-headline"]')).toHaveLength(1)
    expect($('title[data-slot="seo-title"]')).toHaveLength(1)
    expect($('meta[data-slot="seo-description"]')).toHaveLength(1)
  })

  it('captures sample texts (meta via content attribute)', () => {
    expect(result.sampleTexts['hero-headline']).toBe('Emergency Plumbers in Leeds')
    expect(result.sampleTexts['seo-title']).toBe('Apex Plumbing — Emergency Plumbers')
    expect(result.sampleTexts['seo-description']).toBe(
      'Fast local plumbing repairs and boiler servicing.',
    )
    expect(result.sampleTexts['phone']).toBe('0113 000 0000')
  })

  it('derives maxLength as clamp(ceil(len*1.4), 24, 600)', () => {
    const headline = result.manifest.slots.find((s) => s.id === 'hero-headline')
    expect(headline?.maxLength).toBe(38) // ceil(27 * 1.4)
    const cta = result.manifest.slots.find((s) => s.id === 'hero-cta')
    expect(cta?.maxLength).toBe(24) // ceil(17 * 1.4) = 24, floor 24
    expect(deriveMaxLength('')).toBe(24)
    expect(deriveMaxLength('x'.repeat(500))).toBe(600)
  })

  it('turns the 3-card grid into a single repeat template, removing siblings', () => {
    const group = $('[data-repeat="services"]')
    expect(group).toHaveLength(1)
    expect(group.find('.card')).toHaveLength(1)
    const template = group.find('[data-repeat-item]')
    expect(template).toHaveLength(1)
    expect(template.find('[data-slot="title"]').text()).toBe('Boiler repairs')
    expect(template.find('[data-slot="description"]').text()).toBe(
      'Diagnosis and repair for all major boiler brands.',
    )
    expect(template.find('img[data-slot-img="photo"]')).toHaveLength(1)
    expect(result.annotatedHtml).not.toContain('Leak detection')
    expect(result.annotatedHtml).not.toContain('Bathroom fitting')
  })

  it('records the repeat in the manifest with sample-derived item slot lengths', () => {
    const group = result.manifest.repeats.find((g) => g.id === 'services')
    expect(group).toMatchObject({ minItems: 3, maxItems: 6, itemImages: [{ id: 'photo' }] })
    const title = group?.itemSlots.find((s) => s.id === 'title')
    expect(title).toMatchObject({ kind: 'short-label', maxLength: 24 }) // 14 chars → floor 24
    const description = group?.itemSlots.find((s) => s.id === 'description')
    expect(description?.maxLength).toBe(
      deriveMaxLength('Diagnosis and repair for all major boiler brands.'),
    )
    expect(result.sampleTexts['services.title']).toBe('Boiler repairs')
    expect(result.sampleTexts['services.description']).toBe(
      'Diagnosis and repair for all major boiler brands.',
    )
  })

  it('annotates standalone images and clears their src', () => {
    const img = $('img[data-slot-img="hero-image"]')
    expect(img).toHaveLength(1)
    expect(img.attr('src')).toBe('')
    expect(img.attr('data-img-pending')).toBeUndefined()
    expect(result.manifest.images).toEqual([{ id: 'hero-image' }])
  })

  it('strips regions immediately and records them in the manifest', () => {
    expect($('.testimonials')).toHaveLength(0)
    expect(result.annotatedHtml).not.toContain('Amazing work')
    expect(result.manifest.strippedRegions).toEqual([
      { id: 'testimonials', reason: 'testimonials' },
    ])
    expect($('[data-strip]')).toHaveLength(0)
  })

  it('marks the lead form and the phone link', () => {
    expect($('form[data-form="lead"]')).toHaveLength(1)
    expect(result.manifest.form.present).toBe(true)
    expect($('a[data-phone-href]')).toHaveLength(1)
  })

  it('parses the manifest through the frozen schema', () => {
    expect(result.manifest.manifestVersion).toBe(1)
    expect(result.manifest.slots.map((s) => s.id)).toEqual([
      'seo-title',
      'seo-description',
      'hero-headline',
      'hero-sub',
      'hero-cta',
      'phone',
      'services-heading',
      'contact-heading',
    ])
  })

  it('pushes selector misses and ambiguous slot selectors to unmatched', () => {
    const withBadOps = applyAnnotations(sanitized, [
      ...MINI_LANDER_OPS,
      { op: 'slot', selector: '.does-not-exist', id: 'nope-slot', kind: 'paragraph' },
      { op: 'slot', selector: '.faq details summary', id: 'ambiguous', kind: 'short-label' },
    ])
    expect(withBadOps.unmatched).toHaveLength(2)
    expect(withBadOps.unmatched.map((op) => op.selector)).toEqual([
      '.does-not-exist',
      '.faq details summary',
    ])
    expect(withBadOps.manifest.slots.some((s) => s.id === 'nope-slot')).toBe(false)
    expect(withBadOps.manifest.slots.some((s) => s.id === 'ambiguous')).toBe(false)
    expect(result.unmatched).toEqual([])
  })

  it('changes only attributes, apart from the stripped/deduplicated regions', () => {
    const expected = load(sanitized)
    expected('.testimonials').remove()
    expected('.services .card').slice(1).remove()
    expect(stripAnnotations(result.annotatedHtml)).toBe(collapse(expected.html()))
  })
})
