import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { contentDocSchemaFor } from '@tradies/site-spec'
import type { ImageRef } from '@tradies/site-spec'
import { applyAnnotations } from './annotate'
import { renderHtmlSite } from './render-html-site'
import type { HtmlRenderContext } from './render-html-site'
import { sanitizeHtml } from './sanitize'
import { validateAnnotatedTemplate } from './validate-template'
import { MINI_LANDER, MINI_LANDER_OPS } from './test-fixtures'

const POOL = 'plumbing-modern'
const sanitized = sanitizeHtml(MINI_LANDER).html
const { annotatedHtml, manifest } = applyAnnotations(sanitized, MINI_LANDER_OPS)

const ref = (index: number, alt: string): ImageRef => ({ pool: POOL, index, alt })

const doc = {
  slots: {
    'seo-title': 'Apex Plumbing | Leeds Plumbers',
    'seo-description': 'Trusted plumbing repairs across Leeds, day and night.',
    'hero-headline': 'Trusted Plumbers in Leeds',
    'hero-sub': 'Fast fixes for leaks & boilers <b>hi</b> included.',
    'hero-cta': 'Call us today',
    phone: '0113 496 0000',
    'services-heading': 'What we do',
    'contact-heading': 'Request a visit',
    'hero-image-alt': 'Apex van outside a Leeds home',
  },
  repeats: {
    services: [
      { title: 'Boiler servicing', description: 'Annual checks that keep your boiler safe.' },
      { title: 'Leak repairs', description: 'Fast tracing and repair for hidden leaks.' },
      { title: 'Bathroom fitting', description: 'Complete installs from first fix to finish.' },
      { title: 'Drain unblocking', description: 'High-pressure jetting for blocked drains.' },
    ],
  },
  images: { 'hero-image': ref(9, 'Plumber fixing a boiler') },
  repeatImages: {
    services: [
      ref(0, 'Service photo 1'),
      ref(1, 'Service photo 2'),
      ref(2, 'Service photo 3'),
      ref(3, 'Service photo 4'),
    ],
  },
}

const ctx: HtmlRenderContext = {
  resolveImage: (imageRef) => ({ src: `https://img.test/${imageRef.pool}/${imageRef.index}.jpg` }),
  leadFormAction: '/api/lead',
  previewBanner: {
    operatorName: 'Enex Studios',
    businessName: 'Apex Plumbing',
    claimUrl: 'https://claim.test/apex',
  },
  jsonLd: JSON.stringify({ '@type': 'LocalBusiness', name: 'Apex <Plumbing>' }),
  chatEmbed: { src: 'https://chat.test/widget.js', siteId: 'site-1', demo: true },
  privacyNoticeUrl: 'https://ops.test/privacy',
}

describe('renderHtmlSite (full round-trip)', () => {
  it('starts from a template that validates', () => {
    expect(validateAnnotatedTemplate(annotatedHtml, manifest).problems).toEqual([])
  })

  it('renders a content doc that satisfies the manifest-derived schema', () => {
    expect(() => contentDocSchemaFor(manifest, { imageryPool: POOL }).parse(doc)).not.toThrow()
  })

  const out = renderHtmlSite({ annotatedHtml, manifest, doc, ctx })
  const $ = load(`<body>${out.bodyHtml}</body>`)

  it('returns the seo slots as title/description and fills the head', () => {
    expect(out.title).toBe('Apex Plumbing | Leeds Plumbers')
    expect(out.description).toBe('Trusted plumbing repairs across Leeds, day and night.')
    expect(out.headHtml).not.toContain('<title')
    const head = load(`<head>${out.headHtml}</head>`)
    expect(head('meta[name="description"]').attr('content')).toBe(
      'Trusted plumbing repairs across Leeds, day and night.',
    )
    expect(head('style').length).toBeGreaterThanOrEqual(1)
  })

  it('fills slot text and escapes markup in content', () => {
    expect($('[data-slot="hero-headline"]').text()).toBe('Trusted Plumbers in Leeds')
    expect($('[data-slot="hero-sub"]').text()).toBe(
      'Fast fixes for leaks & boilers <b>hi</b> included.',
    )
    expect(out.bodyHtml).toContain('leaks &amp; boilers &lt;b&gt;hi&lt;/b&gt;')
    expect(out.bodyHtml).not.toContain('<b>hi</b>')
  })

  it('clones the repeat template once per item, without template markers', () => {
    const cards = $('[data-repeat="services"] .card')
    expect(cards).toHaveLength(4)
    expect($('[data-repeat-item]')).toHaveLength(0)
    expect(cards.eq(0).find('[data-slot="title"]').text()).toBe('Boiler servicing')
    expect(cards.eq(3).find('[data-slot="description"]').text()).toBe(
      'High-pressure jetting for blocked drains.',
    )
  })

  it('resolves images through ctx.resolveImage with pool refs', () => {
    const hero = $('img[data-slot-img="hero-image"]')
    expect(hero.attr('src')).toBe('https://img.test/plumbing-modern/9.jpg')
    expect(hero.attr('alt')).toBe('Apex van outside a Leeds home') // -alt slot override
    const cardImgs = $('[data-repeat="services"] img[data-slot-img="photo"]')
    expect(cardImgs).toHaveLength(4)
    expect(cardImgs.eq(2).attr('src')).toBe('https://img.test/plumbing-modern/2.jpg')
    expect(cardImgs.eq(2).attr('alt')).toBe('Service photo 3')
  })

  it('wires the lead form: action, method, field names, hidden intent', () => {
    const form = $('form[data-form="lead"]')
    expect(form.attr('action')).toBe('/api/lead')
    expect(form.attr('method')).toBe('post')
    expect(form.find('input[name="name"][type="text"]')).toHaveLength(1)
    expect(form.find('input[name="phone"][type="tel"]')).toHaveLength(1)
    expect(form.find('textarea[name="message"]')).toHaveLength(1)
    expect(form.find('input[type="hidden"][name="intent"][value="lead"]')).toHaveLength(1)
    expect(form.find('a[href="https://ops.test/privacy"]')).toHaveLength(1)
  })

  it('rewrites phone links from the phone slot digits', () => {
    const anchor = $('a[data-phone-href]')
    expect(anchor.attr('href')).toBe('tel:01134960000')
    expect(anchor.text()).toBe('0113 496 0000')
  })

  it('prepends the preview banner as the first child of body', () => {
    const first = $('body').children().first()
    expect(first.attr('data-preview-banner')).toBeDefined()
    expect(first.text()).toContain(
      'Concept preview by Enex Studios — not the official website of Apex Plumbing.',
    )
    expect(first.find('a[href="https://claim.test/apex"]').text()).toBe('Claim this website')
    expect(first.attr('style')).toContain('position:fixed')
    expect(out.headHtml).toContain('padding-top')
  })

  it('appends escaped JSON-LD', () => {
    const script = $('script[type="application/ld+json"]')
    expect(script).toHaveLength(1)
    expect(script.text()).toContain('\\u003c')
    expect(script.text()).not.toContain('<Plumbing>')
  })

  it('appends the chat embed as the only <script src>', () => {
    const external = $('script[src]')
    expect(external).toHaveLength(1)
    expect(external.attr('src')).toBe('https://chat.test/widget.js')
    expect(external.attr('data-site-id')).toBe('site-1')
    expect(external.attr('data-demo')).toBe('true')
    expect(external.attr('defer')).toBeDefined()
  })

  it('keeps the keyless maps embed and the inline accordion script', () => {
    const iframe = $('iframe.map')
    expect(iframe).toHaveLength(1)
    expect(iframe.attr('src')).toContain('output=embed')
    const inline = $('script').filter((_, el) => $(el).text().includes('addEventListener'))
    expect(inline).toHaveLength(1)
  })

  it('preserves body attributes', () => {
    expect(out.bodyAttrs).toEqual({ class: 'page', 'data-theme': 'light' })
  })

  it('omits banner, JSON-LD and chat embed when the context omits them', () => {
    const bare = renderHtmlSite({
      annotatedHtml,
      manifest,
      doc,
      ctx: { resolveImage: ctx.resolveImage, leadFormAction: '/api/lead', previewBanner: null },
    })
    expect(bare.bodyHtml).not.toContain('not the official website')
    expect(bare.headHtml).not.toContain('padding-top')
    const bare$ = load(`<body>${bare.bodyHtml}</body>`)
    expect(bare$('script[src]')).toHaveLength(0)
    expect(bare$('script[type="application/ld+json"]')).toHaveLength(0)
    expect(bare$('form a[href="https://ops.test/privacy"]')).toHaveLength(0)
  })

  it('throws on missing required slot content', () => {
    const { phone: _phone, ...slots } = doc.slots
    expect(() => renderHtmlSite({ annotatedHtml, manifest, doc: { ...doc, slots }, ctx })).toThrow(
      'missing required slot content: "phone"',
    )
  })

  it('throws on missing repeat and image content', () => {
    expect(() =>
      renderHtmlSite({ annotatedHtml, manifest, doc: { ...doc, repeats: {} }, ctx }),
    ).toThrow('missing required repeat content: "services"')
    expect(() =>
      renderHtmlSite({ annotatedHtml, manifest, doc: { ...doc, images: {} }, ctx }),
    ).toThrow('missing required image content: "hero-image"')
  })
})
