import { eq } from 'drizzle-orm'
import { designTemplates, stylePresets, type Db } from '@tradies/db'
import { allDesignTemplateFixtures, type DesignTemplateFixture } from '@tradies/fixtures'
import {
  applyAnnotations,
  extractDesignTokens,
  sanitizeHtml,
  validateAnnotatedTemplate,
} from '@tradies/html-templates'
import type { StylePreset } from '@tradies/site-spec'

/**
 * Seeded html systems still need pool + tone (content generation inputs) and
 * valid palette/fontPair enum values — the latter are placeholders, never
 * rendered, because html-kind sites draw all styling from the template itself.
 */
const HTML_PRESET_DEFAULTS: Record<string, { imageryPool: string; tone: StylePreset['tone'] }> = {
  'craftsman-dark': { imageryPool: 'trades-heritage', tone: 'premium' },
  'coastal-light': { imageryPool: 'trades-modern', tone: 'friendly' },
  'bold-mono': { imageryPool: 'trades-bold', tone: 'no-nonsense' },
}

/**
 * Run one fixture through the REAL ingest machinery (sanitize → annotate →
 * validate) — the same path an operator upload takes in the ops library, so
 * seeding fails loudly if fixtures and engine ever drift.
 */
export function ingestFixtureDesignTemplate(fixture: DesignTemplateFixture) {
  const { html: sanitized, report } = sanitizeHtml(fixture.html)
  const { annotatedHtml, manifest, sampleTexts, unmatched } = applyAnnotations(
    sanitized,
    fixture.annotations,
  )
  if (unmatched.length > 0) {
    throw new Error(
      `design template fixture "${fixture.key}": ${unmatched.length} annotation op(s) did not match the sanitized DOM: ${unmatched
        .map((op) => `${op.op}:${'id' in op ? op.id : op.selector}`)
        .join(', ')}`,
    )
  }
  const validation = validateAnnotatedTemplate(annotatedHtml, manifest)
  if (!validation.ok) {
    throw new Error(
      `design template fixture "${fixture.key}" failed validation: ${validation.problems.join('; ')}`,
    )
  }
  return {
    annotatedHtml,
    manifest,
    sampleTexts,
    sanitizationReport: report,
    validationReport: validation,
    tokens: extractDesignTokens(sanitized),
  }
}

/**
 * Idempotent first-run seeding of the shipped html design systems: one active
 * design_templates row per fixture plus a generic (trade-null) html-kind
 * style preset whose styleKey is the fixture key.
 */
export async function seedDesignTemplates(db: Db): Promise<void> {
  for (const fixture of allDesignTemplateFixtures) {
    const [existing] = await db
      .select({ id: designTemplates.id })
      .from(designTemplates)
      .where(eq(designTemplates.name, fixture.name))
      .limit(1)

    let templateId = existing?.id
    if (!templateId) {
      const ingested = ingestFixtureDesignTemplate(fixture)
      const [row] = await db
        .insert(designTemplates)
        .values({
          name: fixture.name,
          rawHtml: fixture.html,
          componentsHtml: fixture.componentsHtml ?? null,
          annotatedHtml: ingested.annotatedHtml,
          slotManifest: ingested.manifest,
          tokens: ingested.tokens,
          sampleTexts: ingested.sampleTexts,
          sanitizationReport: ingested.sanitizationReport,
          validationReport: ingested.validationReport,
          ingestModel: 'fixture-annotations',
          status: 'active',
          createdBy: 'seed',
        })
        .returning()
      if (!row) throw new Error(`failed to insert design template "${fixture.key}"`)
      templateId = row.id
    }

    const defaults = HTML_PRESET_DEFAULTS[fixture.key] ?? {
      imageryPool: 'trades-modern',
      tone: 'professional' as const,
    }
    await db
      .insert(stylePresets)
      .values({
        styleKey: fixture.key,
        name: fixture.name,
        trade: null,
        templateId: 'html',
        paletteId: 'graphite-amber',
        fontPairId: 'manrope-manrope',
        radius: 'soft',
        variantWeights: {},
        imageryPool: defaults.imageryPool,
        tone: defaults.tone,
        status: 'active',
        kind: 'html',
        designTemplateId: templateId,
        createdBy: 'seed',
      })
      .onConflictDoNothing()
  }
}
