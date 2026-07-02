import { load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { ImageRef, SlotManifest } from '@tradies/site-spec'

/**
 * Pure renderer for html-kind design systems: annotated skeleton + manifest +
 * content doc in, head/body fragments out. No I/O, no clock, no randomness —
 * everything variable arrives via the context.
 */

type DomElement = ReturnType<CheerioAPI> extends Cheerio<infer T> ? T : never

export type HtmlContentDocLike = {
  slots: Record<string, string>
  repeats: Record<string, Record<string, string>[]>
  images: Record<string, ImageRef>
  repeatImages?: Record<string, ImageRef[]>
}

export type HtmlRenderContext = {
  resolveImage(ref: ImageRef): { src: string }
  leadFormAction: string
  previewBanner?: { operatorName: string; businessName: string; claimUrl?: string } | null
  jsonLd?: string
  chatEmbed?: { src: string; siteId: string; demo: boolean } | null
  privacyNoticeUrl?: string
}

export type RenderHtmlSiteResult = {
  title: string
  description: string
  headHtml: string
  bodyHtml: string
  bodyAttrs: Record<string, string>
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** <meta> slots carry their copy in the content attribute; everything else is text. */
function fillSlot(el: Cheerio<DomElement>, value: string): void {
  if (el.is('meta')) el.attr('content', value)
  else el.text(value) // cheerio escapes text nodes on serialisation
}

function applyImage(
  img: Cheerio<DomElement>,
  ref: ImageRef,
  ctx: HtmlRenderContext,
  altOverride: string | undefined,
): void {
  img.attr('src', ctx.resolveImage(ref).src)
  img.attr('alt', altOverride ?? ref.alt)
  img.removeAttr('data-img-pending')
}

const LEAD_FIELD_NAMES = new Set(['name', 'phone', 'message', 'email', 'intent'])

/**
 * The lead pipeline expects inputs named name/phone/message. When the lander
 * uses other names, rename the first text/tel/textarea controls accordingly,
 * never stealing a control already assigned to another lead field.
 */
function ensureLeadFieldNames($: CheerioAPI, form: Cheerio<DomElement>): void {
  const unreserved = (candidates: Cheerio<DomElement>) =>
    candidates.filter((_, node) => {
      const name = $(node).attr('name')
      return !name || !LEAD_FIELD_NAMES.has(name.toLowerCase())
    })
  const textInputs = form.find('input').filter((_, node) => {
    const type = ($(node).attr('type') ?? 'text').toLowerCase()
    return type === 'text'
  })
  const telInputs = form.find('input').filter((_, node) => {
    return ($(node).attr('type') ?? '').toLowerCase() === 'tel'
  })
  const ensure = (fieldName: string, candidates: Cheerio<DomElement>) => {
    if (form.find(`[name="${fieldName}"]`).length > 0) return
    const target = unreserved(candidates).first()
    if (target.length > 0) target.attr('name', fieldName)
  }
  ensure('name', textInputs)
  ensure('phone', telInputs.length > 0 ? telInputs : textInputs)
  ensure('message', form.find('textarea'))
}

function resolvePhoneValue(manifest: SlotManifest, doc: HtmlContentDocLike): string | undefined {
  if (doc.slots['phone'] !== undefined) return doc.slots['phone']
  const phoneSlot = manifest.slots.find((slot) => slot.kind === 'phone')
  return phoneSlot ? doc.slots[phoneSlot.id] : undefined
}

const PREVIEW_BANNER_STYLE = [
  'position:fixed',
  'top:0',
  'left:0',
  'right:0',
  'z-index:2147483000',
  'box-sizing:border-box',
  'background:#111827',
  'color:#ffffff',
  'text-align:center',
  'padding:10px 16px',
  'font:14px/1.5 ui-sans-serif,system-ui,sans-serif',
].join(';')

const PREVIEW_CLAIM_STYLE = [
  'margin-left:8px',
  'color:#ffffff',
  'font-weight:600',
  'text-decoration:underline',
  'text-underline-offset:2px',
].join(';')

export function renderHtmlSite(input: {
  annotatedHtml: string
  manifest: SlotManifest
  doc: HtmlContentDocLike
  ctx: HtmlRenderContext
}): RenderHtmlSiteResult {
  const { annotatedHtml, manifest, doc, ctx } = input
  const $ = load(annotatedHtml)

  // 1. top-level slots
  for (const slot of manifest.slots) {
    const value = doc.slots[slot.id]
    if (value === undefined) {
      if (slot.required) throw new Error(`missing required slot content: "${slot.id}"`)
      continue
    }
    const el = $(`[data-slot="${slot.id}"]`).first()
    if (el.length === 0) {
      throw new Error(`slot "${slot.id}" is in the manifest but not in the template`)
    }
    fillSlot(el, value)
  }

  // 2. repeats: clone the item template once per content item
  for (const group of manifest.repeats) {
    const items = doc.repeats[group.id]
    if (!items || items.length === 0) {
      throw new Error(`missing required repeat content: "${group.id}"`)
    }
    const groupEl = $(`[data-repeat="${group.id}"]`).first()
    if (groupEl.length === 0) {
      throw new Error(`repeat "${group.id}" is in the manifest but not in the template`)
    }
    const template = groupEl.find('[data-repeat-item]').first()
    if (template.length === 0) {
      throw new Error(`repeat "${group.id}" has no [data-repeat-item] template`)
    }
    const refs = doc.repeatImages?.[group.id] ?? []
    items.forEach((item, index) => {
      const clone = template.clone()
      clone.removeAttr('data-repeat-item')
      for (const slot of group.itemSlots) {
        const value = item[slot.id]
        if (value === undefined) {
          if (slot.required) {
            throw new Error(
              `missing required repeat slot content: "${group.id}.${slot.id}" (item ${index})`,
            )
          }
          continue
        }
        const el = clone.find(`[data-slot="${slot.id}"]`).first()
        if (el.length === 0) {
          throw new Error(`repeat "${group.id}" template has no slot "${slot.id}"`)
        }
        fillSlot(el, value)
      }
      for (const image of group.itemImages) {
        const ref = refs[index]
        if (!ref) {
          throw new Error(
            `missing required repeat image: "${group.id}.${image.id}" (item ${index})`,
          )
        }
        const img = clone.find(`[data-slot-img="${image.id}"]`).first()
        if (img.length === 0) {
          throw new Error(`repeat "${group.id}" template has no image "${image.id}"`)
        }
        applyImage(img, ref, ctx, undefined)
      }
      template.before(clone)
    })
    template.remove()
  }

  // 3. standalone images
  for (const image of manifest.images) {
    const ref = doc.images[image.id]
    if (!ref) throw new Error(`missing required image content: "${image.id}"`)
    const img = $(`img[data-slot-img="${image.id}"]`).first()
    if (img.length === 0) {
      throw new Error(`image "${image.id}" is in the manifest but not in the template`)
    }
    applyImage(img, ref, ctx, doc.slots[`${image.id}-alt`])
  }

  // 4. lead form
  const form = $('form[data-form="lead"]').first()
  if (form.length > 0) {
    form.attr('action', ctx.leadFormAction).attr('method', 'post')
    ensureLeadFieldNames($, form)
    const intent = form.find('input[name="intent"]')
    if (intent.length === 0) {
      form.append('<input type="hidden" name="intent" value="lead">')
    } else {
      intent.attr('type', 'hidden').attr('value', 'lead')
    }
    if (ctx.privacyNoticeUrl !== undefined) {
      form.append(
        `<p style="font-size:12px;margin:8px 0 0"><a href="${escapeHtml(ctx.privacyNoticeUrl)}" rel="noopener">Privacy notice</a></p>`,
      )
    }
  }

  // 5. phone links
  const phoneValue = resolvePhoneValue(manifest, doc)
  if (phoneValue !== undefined) {
    const digits = phoneValue.replace(/\D/g, '')
    $('a[data-phone-href]').each((_, node) => {
      $(node).attr('href', `tel:${digits}`)
      $(node).text(phoneValue)
    })
  }

  // 6. preview banner (fixed markup, inline styles — mirrors @tradies/templates)
  if (ctx.previewBanner) {
    const { operatorName, businessName, claimUrl } = ctx.previewBanner
    const claim = claimUrl
      ? `<a href="${escapeHtml(claimUrl)}" style="${PREVIEW_CLAIM_STYLE}">Claim this website</a>`
      : ''
    $('body').prepend(
      `<div data-preview-banner="" style="${PREVIEW_BANNER_STYLE}"><span>Concept preview by ${escapeHtml(operatorName)} — not the official website of ${escapeHtml(businessName)}.</span>${claim}</div>`,
    )
    $('head').append('<style>body{padding-top:44px !important}</style>')
  }

  // 7. JSON-LD — `<` escaped so markup can never leak out of the tag
  if (ctx.jsonLd !== undefined) {
    const safe = ctx.jsonLd.replace(/</g, '\\u003c')
    $('body').append(`<script type="application/ld+json">${safe}</script>`)
  }

  // 8. chat embed — the only <script src> a rendered site may carry
  if (ctx.chatEmbed) {
    $('body').append(
      `<script src="${escapeHtml(ctx.chatEmbed.src)}" data-site-id="${escapeHtml(ctx.chatEmbed.siteId)}" data-demo="${ctx.chatEmbed.demo}" defer></script>`,
    )
  }

  // 9. split into host-page fragments
  const seoTitleSlot = manifest.slots.find((slot) => slot.kind === 'seo-title')
  const title =
    (seoTitleSlot ? doc.slots[seoTitleSlot.id] : undefined) ?? $('title').first().text().trim()
  const seoDescriptionSlot = manifest.slots.find((slot) => slot.kind === 'seo-description')
  const description =
    (seoDescriptionSlot ? doc.slots[seoDescriptionSlot.id] : undefined) ??
    $('meta[name="description"]').attr('content')?.trim() ??
    ''

  const head = $('head').clone()
  head.find('title').remove()

  return {
    title,
    description,
    headHtml: head.html() ?? '',
    bodyHtml: $('body').html() ?? '',
    bodyAttrs: { ...($('body').attr() ?? {}) },
  }
}
