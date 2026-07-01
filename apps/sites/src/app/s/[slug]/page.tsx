import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { siteSpecs, sites } from '@tradies/db/schema'
import { parseSiteSpec } from '@tradies/site-spec'
import { renderSite } from '@tradies/templates'
import { getDb } from '@/lib/db'
import { googleFontsUrl } from '@/lib/fonts'
import { buildTemplateContext } from '@/lib/render-context'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

async function loadSite(slug: string) {
  const db = getDb()
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1)
  if (!site || site.status === 'expired' || site.status === 'disabled') return null
  const [specRow] = await db
    .select()
    .from(siteSpecs)
    .where(eq(siteSpecs.prospectId, site.prospectId))
    .orderBy(siteSpecs.version)
  if (!specRow) return null
  const versioned = await db
    .select()
    .from(siteSpecs)
    .where(eq(siteSpecs.prospectId, site.prospectId))
  const current =
    versioned.find((v) => v.version === site.currentSpecVersion) ?? versioned[versioned.length - 1]
  if (!current) return null
  return { site, spec: parseSiteSpec(current.spec) }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const loaded = await loadSite(slug)
  if (!loaded) return { robots: { index: false, follow: false } }
  return {
    title: loaded.spec.seo.title,
    description: loaded.spec.seo.description,
    robots: loaded.site.noindex ? { index: false, follow: false } : undefined,
  }
}

export default async function TenantPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const loaded = await loadSite(slug)
  if (!loaded) notFound()
  const { site, spec } = loaded
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
    </>
  )
}
