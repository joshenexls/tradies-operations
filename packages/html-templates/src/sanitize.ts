import { load } from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { z } from 'zod'

/**
 * Deterministic sanitisation of an uploaded, self-contained HTML lander.
 * Runs BEFORE annotation. Every pass is a pure DOM transform — no network,
 * no clock, no randomness — so the same input always yields the same output.
 *
 * The same detectors run in dry-run mode via `scanRemovableContent`, which
 * template validation uses to prove an annotated template is still clean.
 */

export const sanitizationReportSchema = z.object({
  removedScripts: z.array(z.string()),
  removedExternalRefs: z.array(z.string()),
  keptMapsEmbeds: z.number().int().min(0),
  neutralizedForms: z.number().int().min(0),
  externalImages: z.number().int().min(0),
  demotedH1s: z.number().int().min(0),
})
export type SanitizationReport = z.infer<typeof sanitizationReportSchema>

export type SanitizeResult = { html: string; report: SanitizationReport }

/** Inline script bodies that can exfiltrate data or phone home. */
const DANGEROUS_INLINE =
  /fetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|import\s*\(|navigator\.geolocation/

/** The ONE allowed external embed: the keyless Google Maps iframe. */
const MAPS_EMBED_ORIGIN = /^https:\/\/(?:(?:www\.)?google\.com\/maps|maps\.google\.com\/maps)/

const ALLOWED_FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

function isExternalRef(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value.trim())
}

function isExternalImageSrc(value: string): boolean {
  const trimmed = value.trim()
  return /^(?:https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed)
}

function isAllowedFontStylesheet(href: string): boolean {
  const trimmed = href.trim()
  const absolute = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
  try {
    return ALLOWED_FONT_HOSTS.has(new URL(absolute).hostname)
  } catch {
    return false
  }
}

export function isAllowedMapsEmbed(src: string): boolean {
  const trimmed = src.trim()
  if (!MAPS_EMBED_ORIGIN.test(trimmed)) return false
  return trimmed.includes('output=embed') || trimmed.includes('/maps/embed')
}

type FindingKind =
  | 'script-src'
  | 'inline-script'
  | 'external-stylesheet'
  | 'embed'
  | 'base'
  | 'meta-refresh'
  | 'ping-attr'
  | 'srcset-attr'
  | 'form-action'
  | 'external-img'
  | 'extra-h1'

type Finding = { kind: FindingKind; detail: string }

/**
 * One pass over the document, either mutating (sanitize) or dry-run (scan).
 * The findings list is identical in both modes, which is what makes the
 * validator's "sanitizer re-scan" an exact re-run of these detectors.
 */
function runSanitizePasses(
  $: CheerioAPI,
  mutate: boolean,
): { findings: Finding[]; keptMapsEmbeds: number } {
  const findings: Finding[] = []
  let keptMapsEmbeds = 0

  // 1. scripts: every external script, plus inline scripts that phone home
  for (const node of $('script').toArray()) {
    const el = $(node)
    const src = el.attr('src')
    if (src !== undefined) {
      findings.push({ kind: 'script-src', detail: src })
      if (mutate) el.remove()
      continue
    }
    const text = el.text()
    if (DANGEROUS_INLINE.test(text)) {
      findings.push({ kind: 'inline-script', detail: text.trim().slice(0, 80) })
      if (mutate) el.remove()
    }
  }

  // 2. external stylesheets, except the Google Fonts hosts
  for (const node of $('link[rel]').toArray()) {
    const el = $(node)
    const rel = (el.attr('rel') ?? '').trim().toLowerCase()
    if (!rel.split(/\s+/).includes('stylesheet')) continue
    const href = el.attr('href') ?? ''
    if (!isExternalRef(href) || isAllowedFontStylesheet(href)) continue
    findings.push({ kind: 'external-stylesheet', detail: href })
    if (mutate) el.remove()
  }

  // 3. embeds: iframes (except the keyless maps embed), object, embed
  for (const node of $('iframe').toArray()) {
    const el = $(node)
    const src = el.attr('src') ?? ''
    if (isAllowedMapsEmbed(src)) {
      keptMapsEmbeds += 1
      continue
    }
    findings.push({ kind: 'embed', detail: src || '<iframe>' })
    if (mutate) el.remove()
  }
  for (const node of $('object, embed').toArray()) {
    const el = $(node)
    findings.push({
      kind: 'embed',
      detail: el.attr('data') ?? el.attr('src') ?? `<${node.tagName}>`,
    })
    if (mutate) el.remove()
  }

  // 4. navigation hijacks and tracking attributes
  for (const node of $('base').toArray()) {
    findings.push({ kind: 'base', detail: $(node).attr('href') ?? '<base>' })
    if (mutate) $(node).remove()
  }
  for (const node of $('meta[http-equiv]').toArray()) {
    const el = $(node)
    if ((el.attr('http-equiv') ?? '').trim().toLowerCase() !== 'refresh') continue
    findings.push({ kind: 'meta-refresh', detail: el.attr('content') ?? '<meta refresh>' })
    if (mutate) el.remove()
  }
  for (const node of $('a[ping]').toArray()) {
    findings.push({ kind: 'ping-attr', detail: $(node).attr('ping') ?? '' })
    if (mutate) $(node).removeAttr('ping')
  }
  for (const node of $('[srcset]').toArray()) {
    findings.push({ kind: 'srcset-attr', detail: $(node).attr('srcset') ?? '' })
    if (mutate) $(node).removeAttr('srcset')
  }

  // 5. forms may never post anywhere until the renderer wires the lead action
  for (const node of $('form').toArray()) {
    const el = $(node)
    const action = el.attr('action')
    if (action === undefined || action.trim() === '#') continue
    findings.push({ kind: 'form-action', detail: action })
    if (mutate) el.attr('action', '#')
  }

  // 6. external images become pending placeholders (resolved from the pool later)
  for (const node of $('img[src]').toArray()) {
    const el = $(node)
    const src = el.attr('src') ?? ''
    if (!isExternalImageSrc(src)) continue
    findings.push({ kind: 'external-img', detail: src.slice(0, 120) })
    if (mutate) el.attr('src', '').attr('data-img-pending', '')
  }

  // 7. exactly one h1: demote the rest
  for (const node of $('h1').toArray().slice(1)) {
    findings.push({ kind: 'extra-h1', detail: $(node).text().trim().slice(0, 80) })
    if (mutate) node.tagName = 'h2'
  }

  return { findings, keptMapsEmbeds }
}

export function sanitizeHtml(raw: string): SanitizeResult {
  const $ = load(raw)
  const { findings, keptMapsEmbeds } = runSanitizePasses($, true)
  const report: SanitizationReport = {
    removedScripts: findings
      .filter((f) => f.kind === 'script-src' || f.kind === 'inline-script')
      .map((f) => f.detail),
    removedExternalRefs: findings
      .filter((f) => f.kind === 'external-stylesheet' || f.kind === 'embed')
      .map((f) => f.detail),
    keptMapsEmbeds,
    neutralizedForms: findings.filter((f) => f.kind === 'form-action').length,
    externalImages: findings.filter((f) => f.kind === 'external-img').length,
    demotedH1s: findings.filter((f) => f.kind === 'extra-h1').length,
  }
  return { html: $.html(), report: sanitizationReportSchema.parse(report) }
}

/**
 * Dry-run of every sanitizer detector: returns one human-readable line per
 * would-be removal/neutralisation. A clean template returns [].
 */
export function scanRemovableContent(html: string): string[] {
  const $ = load(html)
  const { findings } = runSanitizePasses($, false)
  return findings.map((f) => `${f.kind}: ${f.detail}`)
}
