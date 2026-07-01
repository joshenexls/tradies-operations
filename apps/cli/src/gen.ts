/**
 * Manual mode: generate a site on demand through the exact same engine and
 * validators as the automated pipeline.
 *
 *   pnpm gen --name "Smith Plumbing" --trade plumber --town Leeds \
 *     [--style modern] [--phone "0113 496 0123"] [--email info@smith.example] \
 *     [--areas "Leeds,Headingley,Otley"] [--services "Boiler repair,Bathrooms"]
 *
 * Writes to the shared PGlite dir (stop the dev server first) and emits a
 * standalone HTML preview under out/preview/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { customAlphabet } from 'nanoid'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPgliteDb } from '@tradies/db'
import { migrateDb } from '@tradies/db/migrate'
import { prospects, sites, siteSpecs } from '@tradies/db/schema'
import { FixtureLLM } from '@tradies/llm'
import {
  parseSiteSpec,
  resolveStylePreset,
  tradeSchema,
  validateSpecAgainstFacts,
  validateSpecAgainstPreset,
  type BusinessFacts,
} from '@tradies/site-spec'
import { renderSite, SEED_STYLE_PRESETS, type TemplateContext } from '@tradies/templates'

const slugId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

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
  const preset = resolveStylePreset(SEED_STYLE_PRESETS, values.style ?? 'modern', trade)
  if (!preset) {
    const keys = [...new Set(SEED_STYLE_PRESETS.map((p) => p.styleKey))].join(', ')
    fail(`unknown style "${values.style}" — available systems: ${keys}`)
  }

  console.log(
    `\nGenerating "${name}" (${trade}, ${town}) with system "${preset.styleKey}"${preset.trade ? ` [${preset.trade} specialisation]` : ' [generic]'}...`,
  )

  const generator = new FixtureLLM()
  const { candidate } = await generator.generateSiteSpec({ facts, preset })
  const spec = parseSiteSpec(candidate)
  const factReport = validateSpecAgainstFacts(spec)
  const presetReport = validateSpecAgainstPreset(spec, preset)
  if (!factReport.ok)
    fail(`FACT-GUARD rejected the spec:\n${JSON.stringify(factReport.violations, null, 2)}`)
  if (!presetReport.ok) fail(`preset validation failed:\n${presetReport.violations.join('\n')}`)

  const db = createPgliteDb(process.env.PGLITE_DIR ?? '../sites/.pglite/dev')
  await migrateDb(db)

  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)}-${slugId()}`
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
    })
    .returning()
  if (!prospect) fail('failed to insert prospect')

  await db.insert(siteSpecs).values({
    prospectId: prospect.id,
    version: 1,
    spec,
    templateId: spec.templateId,
    model: 'fixture-llm',
    promptVersion: 'site-spec-v1',
    validationReport: { fact: factReport, preset: presetReport },
    generatedBy: 'llm',
  })
  await db.insert(sites).values({
    prospectId: prospect.id,
    slug,
    currentSpecVersion: 1,
    status: 'preview',
    noindex: true,
    claimToken: `claim-${slugId()}`,
    portalToken: `portal-${slugId()}`,
  })

  const ctx: TemplateContext = {
    resolveImage: (ref) => ({
      src: `https://placehold.local/pool/${ref.pool}/${ref.index}`,
      width: 1600,
      height: 1000,
    }),
    leadFormAction: '#lead-form-disabled-in-static-preview',
    placeId: null,
    previewBanner: { operatorName: 'Tradies Studio' },
    privacyNoticeUrl: '#',
  }
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${spec.seo.title}</title></head><body>${renderToStaticMarkup(renderSite(spec, ctx))}</body></html>`
  await mkdir('out/preview', { recursive: true })
  const htmlPath = `out/preview/${slug}.html`
  await writeFile(htmlPath, html)

  console.log(`\n✓ Generated and stored as version 1`)
  console.log(`  slug:     ${slug}`)
  console.log(
    `  dev URL:  http://${slug}.localhost:3000  (start: pnpm --filter @tradies/sites dev)`,
  )
  console.log(`  static:   apps/cli/${htmlPath}  (unstyled markup preview)`)
  console.log(`  sections: ${spec.sections.map((s) => `${s.kind}/${s.variant}`).join(', ')}\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
