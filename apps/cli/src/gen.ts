/**
 * Manual mode: generate a site on demand through the exact same engine and
 * validators as the automated pipeline.
 *
 *   pnpm gen --name "Smith Plumbing" --trade plumber --town Leeds \
 *     [--style modern] [--phone "0113 496 0123"] [--email info@smith.example] \
 *     [--areas "Leeds,Headingley,Otley"] [--services "Boiler repair,Bathrooms"]
 *
 * Writes to the shared PGlite dir (stop the dev server first) and emits a
 * standalone HTML preview under out/preview/. Set SITE_GENERATOR=anthropic
 * (+ ANTHROPIC_API_KEY) to generate with real Claude.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { migrateDb } from '@tradies/db/migrate'
import { createPgliteDb } from '@tradies/db/pglite'
import { designTemplates, prospects } from '@tradies/db/schema'
import {
  GenerationFailedError,
  generateSiteVersion,
  resolveActivePreset,
  resolveContentDocGeneratorFromEnv,
  resolveCostRatesFromEnv,
  resolveGeneratorFromEnv,
  seedDesignTemplates,
  seedStylePresets,
} from '@tradies/engine'
import { renderHtmlSite } from '@tradies/html-templates'
import { buildSiteLocation, tradeSchema, type BusinessFacts } from '@tradies/site-spec'
import { renderSite, type TemplateContext } from '@tradies/templates'

const { values } = parseArgs({
  // pnpm run forwards a literal `--` separator — tolerate positionals
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    trade: { type: 'string' },
    town: { type: 'string' },
    style: { type: 'string', default: 'modern' },
    phone: { type: 'string' },
    email: { type: 'string' },
    areas: { type: 'string' },
    services: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

const name = values.name ?? fail('--name is required')
const town = values.town ?? fail('--town is required')
const tradeResult = tradeSchema.safeParse(values.trade)
if (!tradeResult.success) fail(`--trade must be one of: ${tradeSchema.options.join(', ')}`)
const trade = tradeResult.data

// Operator-entered facts: everything below carries 'operator' provenance —
// the generator can only use what is typed here (FACT-GUARD enforces it).
const facts: BusinessFacts = {
  businessName: name,
  trade,
  town,
  phone: values.phone ? { value: values.phone, source: 'operator' } : undefined,
  email: values.email ? { value: values.email, source: 'operator' } : undefined,
  serviceAreas: values.areas
    ? values.areas
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)
    : [town],
  services: (values.services ? values.services.split(',') : [])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => ({ value, source: 'operator' as const })),
  accreditations: [],
  claims: [],
}

async function main() {
  const db = createPgliteDb(process.env.PGLITE_DIR ?? '../sites/.pglite/dev')
  await migrateDb(db)
  await seedStylePresets(db)
  await seedDesignTemplates(db)

  const styleKey = values.style ?? 'modern'
  const resolved = await resolveActivePreset(db, styleKey, trade)
  if (!resolved) fail(`unknown style "${styleKey}" — check the design library (/library in ops)`)
  const { preset, presetId } = resolved

  console.log(
    `\nGenerating "${name}" (${trade}, ${town}) with system "${preset.styleKey}"${preset.trade ? ` [${preset.trade} specialisation]` : ' [generic]'}...`,
  )

  const [prospect] = await db
    .insert(prospects)
    .values({
      businessName: name,
      city: town,
      trade,
      source: 'manual',
      status: 'in_review',
      segment: 'no_site',
      phone: values.phone ?? null,
      extractedProfile: facts,
    })
    .returning()
  if (!prospect) fail('failed to insert prospect')

  let result
  try {
    result = await generateSiteVersion({
      db,
      generator: resolveGeneratorFromEnv(),
      contentDocGenerator: resolveContentDocGeneratorFromEnv(),
      prospectId: prospect.id,
      facts,
      preset,
      stylePresetId: presetId,
      costRates: resolveCostRatesFromEnv(),
    })
  } catch (err) {
    if (err instanceof GenerationFailedError) fail(err.message)
    throw err
  }
  const { stored, slug } = result

  // manual prospects have no place id, so the map renders from name/town and
  // the reviews CTA stays hidden (correct — there's no listing to point at)
  const location = buildSiteLocation({ businessName: facts.businessName, town })

  let html: string
  let summary: string
  if (stored.kind === 'component') {
    const spec = stored.spec
    const ctx: TemplateContext = {
      resolveImage: (ref) => ({
        src: `https://placehold.local/pool/${ref.pool}/${ref.index}`,
        width: 1600,
        height: 1000,
      }),
      leadFormAction: '#lead-form-disabled-in-static-preview',
      placeId: null,
      location,
      previewBanner: { operatorName: 'Tradies Studio' },
      privacyNoticeUrl: '#',
    }
    html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${spec.seo.title}</title></head><body>${renderToStaticMarkup(renderSite(spec, ctx))}</body></html>`
    summary = `sections: ${spec.sections.map((s) => `${s.kind}/${s.variant}`).join(', ')}`
  } else {
    const [template] = await db
      .select()
      .from(designTemplates)
      .where(eq(designTemplates.id, stored.doc.designTemplateId))
      .limit(1)
    if (!template?.annotatedHtml || !template.slotManifest) {
      fail(`design template ${stored.doc.designTemplateId} is missing its ingested skeleton`)
    }
    const rendered = renderHtmlSite({
      annotatedHtml: template.annotatedHtml,
      manifest: template.slotManifest,
      doc: stored.doc.contentDoc,
      ctx: {
        resolveImage: (ref) => ({ src: `https://placehold.local/pool/${ref.pool}/${ref.index}` }),
        leadFormAction: '#lead-form-disabled-in-static-preview',
        location,
        previewBanner: { operatorName: 'Tradies Studio', businessName: facts.businessName },
      },
    })
    const bodyAttrs = Object.entries(rendered.bodyAttrs)
      .map(([k, v]) => ` ${k}="${v.replaceAll('"', '&quot;')}"`)
      .join('')
    html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${rendered.title}</title>${rendered.headHtml}</head><body${bodyAttrs}>${rendered.bodyHtml}</body></html>`
    summary = `system:   ${preset.styleKey} (html design system, ${template.slotManifest.slots.length} slots)`
  }
  await mkdir('out/preview', { recursive: true })
  const htmlPath = `out/preview/${slug}.html`
  await writeFile(htmlPath, html)

  console.log(
    `\n✓ Generated and stored as version ${result.version} (${result.attempts} attempt${result.attempts > 1 ? 's' : ''})`,
  )
  console.log(`  slug:     ${slug}`)
  console.log(
    `  dev URL:  http://${slug}.localhost:3000  (start: pnpm --filter @tradies/sites dev)`,
  )
  console.log(`  static:   apps/cli/${htmlPath}`)
  console.log(`  ${summary}\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
