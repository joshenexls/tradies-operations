import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { events, sites, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'

const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 780 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

/**
 * Screenshot the live preview at three viewports into RENDER_QA_DIR
 * (path shape qa/{slug}/{version}/{viewport}.png — R2 swap is a writer
 * change). QA failure flags for the operator; it never crashes the pipeline.
 */
export async function renderQa(
  db: Db,
  input: { prospectId: string; previewUrl: (slug: string) => string; outDir?: string },
): Promise<{ ok: boolean; refs: string[]; reason?: string }> {
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.prospectId, input.prospectId))
    .limit(1)
  if (!site) return { ok: false, refs: [], reason: 'no_site' }

  const outDir = input.outDir ?? process.env.RENDER_QA_DIR ?? '.qa-artifacts'
  const refs: string[] = []
  let reason: string | undefined
  try {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    })
    try {
      const page = await browser.newPage()
      await page.goto(input.previewUrl(site.slug), { waitUntil: 'networkidle' })
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        const ref = path.join(
          'qa',
          site.slug,
          String(site.currentSpecVersion ?? 1),
          `${viewport.name}.png`,
        )
        const file = path.join(outDir, ref)
        await mkdir(path.dirname(file), { recursive: true })
        await page.screenshot({ path: file, fullPage: true })
        refs.push(ref)
      }
    } finally {
      await browser.close()
    }
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err)
  }

  const ok = refs.length === VIEWPORTS.length
  await db.insert(events).values({
    prospectId: input.prospectId,
    siteId: site.id,
    actor: 'system',
    type: EVENT_TYPES.qaRendered,
    payload: { ok, refs, reason: reason ?? null },
  })
  return { ok, refs, reason }
}
