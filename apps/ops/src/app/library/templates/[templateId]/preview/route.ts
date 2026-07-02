import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { designTemplates, stylePresets } from '@tradies/db/schema'
import { getFixture } from '@tradies/fixtures'
import { renderHtmlSite } from '@tradies/html-templates'
import { buildFixtureContentDoc } from '@tradies/llm'
import { getDb } from '@/lib/db'
import { isUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'

/**
 * Operator-only draft preview of an ingested html design system: the stored
 * annotated skeleton rendered with a deterministic fixture content doc. This
 * is the one surface that emits template HTML verbatim — that HTML has
 * already passed sanitize + validate at ingest time, and the response is
 * marked noindex behind the ops Basic-auth wall.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params
  if (!isUuid(templateId)) {
    return new NextResponse('Not found', { status: 404 })
  }
  const db = getDb()
  const [row] = await db
    .select()
    .from(designTemplates)
    .where(eq(designTemplates.id, templateId))
    .limit(1)
  if (!row) return new NextResponse('Not found', { status: 404 })
  if (!row.annotatedHtml || !row.slotManifest) {
    return new NextResponse('Template has no validated annotation yet — re-ingest it first.', {
      status: 409,
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    })
  }

  // pool + tone come from the template's own preset when one exists
  const [preset] = await db
    .select({ imageryPool: stylePresets.imageryPool, tone: stylePresets.tone })
    .from(stylePresets)
    .where(eq(stylePresets.designTemplateId, templateId))
    .limit(1)

  const facts = getFixture('leeds-plumber-swift').facts
  const doc = buildFixtureContentDoc({
    facts,
    manifest: row.slotManifest,
    imageryPool: preset?.imageryPool ?? 'trades-modern',
    tone: preset?.tone ?? 'professional',
    sampleTexts: row.sampleTexts ?? {},
  })

  let rendered
  try {
    rendered = renderHtmlSite({
      annotatedHtml: row.annotatedHtml,
      manifest: row.slotManifest,
      doc,
      ctx: {
        // the ops app ships its own deterministic /pool/[pool]/[index] SVG
        // placeholders (same URL shape as the sites app), so previews stay
        // self-contained and offline
        resolveImage: (ref) => ({ src: `/pool/${ref.pool}/${ref.index}` }),
        leadFormAction: '#preview',
        previewBanner: { operatorName: 'Tradies Studio', businessName: facts.businessName },
      },
    })
  } catch (err) {
    return new NextResponse(
      `Preview render failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    )
  }

  const bodyAttrs = Object.entries(rendered.bodyAttrs)
    .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
    .join('')
  const description = rendered.description
    ? `<meta name="description" content="${escapeHtml(rendered.description)}">\n`
    : ''
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(rendered.title)}</title>
${description}${rendered.headHtml}
</head>
<body${bodyAttrs}>${rendered.bodyHtml}</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  })
}
