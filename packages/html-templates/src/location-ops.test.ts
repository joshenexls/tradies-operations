import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import type { SiteLocation } from '@tradies/site-spec'
import { applyAnnotations } from './annotate'
import type { AnnotationOpInput } from './annotate'
import { renderHtmlSite } from './render-html-site'
import type { HtmlContentDocLike, HtmlRenderContext } from './render-html-site'
import { sanitizeHtml } from './sanitize'
import { validateAnnotatedTemplate } from './validate-template'

/**
 * Minimal contact/location lander: one h1, the ONE sanitizer-approved keyless
 * Google Maps iframe and a compliant reviews CTA — "reviews on Google" (safe),
 * never the review-pattern "Google reviews". Exercises the map / reviews-link
 * ops end to end: annotate marks them (no manifest slot), render fills or
 * removes them from ctx.location, and validate stays clean (sanitizer fixpoint,
 * no review-pattern false positive).
 */
const LOCATION_LANDER = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Find Us</title>
</head>
<body>
<h1 class="headline">Where to Find Us</h1>
<section class="location">
  <iframe class="map" src="https://maps.google.com/maps?q=placeholder&output=embed" title="Map"></iframe>
  <a class="reviews-cta" href="https://example.com">See our reviews on Google</a>
</section>
</body>
</html>`

const LOCATION_OPS: AnnotationOpInput[] = [
  { op: 'slot', selector: '.headline', id: 'headline', kind: 'headline' },
  { op: 'map', selector: '.map' },
  { op: 'reviews-link', selector: '.reviews-cta' },
]

const sanitized = sanitizeHtml(LOCATION_LANDER).html
const annotated = applyAnnotations(sanitized, LOCATION_OPS)

describe('applyAnnotations — map / reviews-link ops', () => {
  it('marks exactly one iframe with data-map-embed and adds no manifest slot', () => {
    const $ = load(annotated.annotatedHtml)
    expect($('iframe[data-map-embed]')).toHaveLength(1)
    expect($('iframe.map').attr('data-map-embed')).toBe('')
    // markers only, like phone-link — no slots/repeats/images from these ops
    expect(annotated.manifest.slots.map((s) => s.id)).toEqual(['headline'])
    expect(annotated.manifest.repeats).toEqual([])
    expect(annotated.manifest.images).toEqual([])
    expect(annotated.unmatched).toEqual([])
  })

  it('marks the reviews anchor with data-reviews-link', () => {
    const $ = load(annotated.annotatedHtml)
    expect($('a[data-reviews-link]')).toHaveLength(1)
    expect($('a.reviews-cta').attr('data-reviews-link')).toBe('')
  })

  it('sends a map selector that matches no iframe or a non-iframe to unmatched', () => {
    const noMatch = applyAnnotations(sanitized, [{ op: 'map', selector: '.nope' }])
    expect(noMatch.unmatched).toEqual([{ op: 'map', selector: '.nope' }])

    const nonIframe = applyAnnotations(sanitized, [{ op: 'map', selector: '.headline' }])
    expect(nonIframe.unmatched).toEqual([{ op: 'map', selector: '.headline' }])
    expect(load(nonIframe.annotatedHtml)('[data-map-embed]')).toHaveLength(0)
  })

  it('sends a reviews-link selector that matches no anchor to unmatched', () => {
    const miss = applyAnnotations(sanitized, [{ op: 'reviews-link', selector: '.headline' }])
    expect(miss.unmatched).toEqual([{ op: 'reviews-link', selector: '.headline' }])
    expect(load(miss.annotatedHtml)('[data-reviews-link]')).toHaveLength(0)
  })
})

const baseCtx: HtmlRenderContext = {
  resolveImage: (ref) => ({ src: `img/${ref.index}` }),
  leadFormAction: '/api/lead',
  previewBanner: null,
}

const doc: HtmlContentDocLike = {
  slots: { headline: 'Where to Find Us' },
  repeats: {},
  images: {},
}

const location: SiteLocation = {
  mapsEmbedSrc: 'https://maps.google.com/maps?q=Apex%20Plumbing%2C%20Leeds&output=embed',
  reviewsUrl: 'https://search.google.com/local/reviews?placeid=abc123',
}

function render(ctx: HtmlRenderContext) {
  const out = renderHtmlSite({
    annotatedHtml: annotated.annotatedHtml,
    manifest: annotated.manifest,
    doc,
    ctx,
  })
  return load(`<body>${out.bodyHtml}</body>`)
}

describe('renderHtmlSite — location surfaces', () => {
  it('swaps the map src and wires the reviews link (rel=noopener) from ctx.location', () => {
    const $ = render({ ...baseCtx, location })
    expect($('iframe[data-map-embed]').attr('src')).toBe(location.mapsEmbedSrc)
    const link = $('a[data-reviews-link]')
    expect(link).toHaveLength(1)
    expect(link.attr('href')).toBe(location.reviewsUrl)
    expect(link.attr('rel')).toBe('noopener')
  })

  it('removes the reviews link but keeps the filled map when reviewsUrl is null', () => {
    const $ = render({ ...baseCtx, location: { ...location, reviewsUrl: null } })
    expect($('a[data-reviews-link]')).toHaveLength(0)
    expect($('iframe[data-map-embed]').attr('src')).toBe(location.mapsEmbedSrc)
  })

  it('removes both the reviews link and the map iframe when ctx.location is absent', () => {
    const $ = render(baseCtx)
    expect($('a[data-reviews-link]')).toHaveLength(0)
    // no query → drop the iframe rather than leave the lander's placeholder src
    expect($('iframe[data-map-embed]')).toHaveLength(0)
  })

  it('removes the map iframe when the map is disabled (empty mapsEmbedSrc)', () => {
    const $ = render({ ...baseCtx, location: { ...location, mapsEmbedSrc: '' } })
    expect($('iframe[data-map-embed]')).toHaveLength(0)
  })
})

describe('validateAnnotatedTemplate — location surfaces', () => {
  it('stays ok with a maps iframe and a compliant "reviews on Google" anchor', () => {
    const result = validateAnnotatedTemplate(annotated.annotatedHtml, annotated.manifest)
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
  })
})
