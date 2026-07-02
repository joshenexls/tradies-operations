import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import type { DesignTemplateRow } from '@tradies/db'
import { designTemplates, siteSpecs, sites } from '@tradies/db/schema'
import { parseStoredSpec, type StoredSpec } from '@tradies/site-spec'
import { renderHtmlSite } from '@tradies/html-templates'
import { renderSite } from '@tradies/templates'
import { getDb } from '@/lib/db'
import { googleFontsUrl } from '@/lib/fonts'
import { logPreviewVisit } from '@/lib/preview-visits'
import {
  buildHtmlRenderContext,
  buildTemplateContext,
  chatWidgetEnabled,
} from '@/lib/render-context'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

type Loaded = {
  site: typeof sites.$inferSelect
  stored: StoredSpec
  /** Only present for html-kind specs — the ingested skeleton to render into. */
  template: DesignTemplateRow | null
}

async function loadSite(slug: string): Promise<Loaded | null> {
  const db = getDb()
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1)
  if (!site || site.status === 'expired' || site.status === 'disabled') return null
  const versioned = await db
    .select()
    .from(siteSpecs)
    .where(eq(siteSpecs.prospectId, site.prospectId))
  const current =
    versioned.find((v) => v.version === site.currentSpecVersion) ?? versioned[versioned.length - 1]
  if (!current) return null
  const stored = parseStoredSpec(current.spec)
  if (stored.kind === 'html') {
    const [template] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, stored.doc.designTemplateId))
      .limit(1)
    if (!template?.annotatedHtml || !template.slotManifest) return null
    return { site, stored, template }
  }
  return { site, stored, template: null }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const loaded = await loadSite(slug)
  if (!loaded) return { robots: { index: false, follow: false } }
  const robots = loaded.site.noindex ? { index: false, follow: false } : undefined
  if (loaded.stored.kind === 'component') {
    const { seo } = loaded.stored.spec
    return { title: seo.title, description: seo.description, robots }
  }
  const { doc } = loaded.stored
  const manifest = loaded.template!.slotManifest!
  const titleSlot = manifest.slots.find((s) => s.kind === 'seo-title')
  const descriptionSlot = manifest.slots.find((s) => s.kind === 'seo-description')
  return {
    title: (titleSlot && doc.contentDoc.slots[titleSlot.id]) ?? doc.facts.businessName,
    description: descriptionSlot ? doc.contentDoc.slots[descriptionSlot.id] : undefined,
    robots,
  }
}

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ op?: string }>
}) {
  const { slug } = await params
  const { op } = await searchParams
  const loaded = await loadSite(slug)
  if (!loaded) notFound()
  const { site, stored, template } = loaded

  const requestHeaders = await headers()
  after(() =>
    logPreviewVisit(getDb(), {
      siteId: site.id,
      path: `/${slug}`,
      ip:
        requestHeaders.get('cf-connecting-ip') ??
        requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        null,
      userAgent: requestHeaders.get('user-agent'),
      referrer: requestHeaders.get('referer'),
      isOperator: op === '1',
    }),
  )

  if (stored.kind === 'html') {
    const rendered = renderHtmlSite({
      annotatedHtml: template!.annotatedHtml!,
      manifest: template!.slotManifest!,
      doc: stored.doc.contentDoc,
      ctx: buildHtmlRenderContext({
        siteId: site.id,
        noindex: site.noindex,
        facts: stored.doc.facts,
        claimToken: site.claimToken,
      }),
    })
    const bodyAttrs = Object.entries(rendered.bodyAttrs)
    return (
      <>
        {/* head fragment (styles/links/meta, title stripped) — display:contents
            keeps the wrapper out of layout; style/link apply from anywhere */}
        <div
          style={{ display: 'contents' }}
          dangerouslySetInnerHTML={{ __html: rendered.headHtml }}
        />
        <div
          style={{ display: 'contents' }}
          dangerouslySetInnerHTML={{ __html: rendered.bodyHtml }}
        />
        {bodyAttrs.length > 0 ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `for (const [k, v] of ${JSON.stringify(bodyAttrs).replace(/</g, '\\u003c')}) document.body.setAttribute(k, v);`,
            }}
          />
        ) : null}
      </>
    )
  }

  const spec = stored.spec
  const ctx = buildTemplateContext({
    siteId: site.id,
    slug: site.slug,
    noindex: site.noindex,
    claimToken: site.claimToken,
    placeId: null,
  })
  return (
    <>
      <link rel="stylesheet" href={googleFontsUrl(spec.theme.fontPairId)} />
      {renderSite(spec, ctx)}
      {chatWidgetEnabled() ? (
        <script
          src="/embed/v1.js"
          data-site-id={site.id}
          data-demo={site.noindex ? 'true' : 'false'}
          defer
        />
      ) : null}
    </>
  )
}
