import { desc, eq } from 'drizzle-orm'
import { designTemplates, events, sites, siteSpecs, type Db } from '@tradies/db'
import type { ContentDocGenerator, SiteSpecGenerator } from '@tradies/llm'
import { noopObserver, type GenerationObserver } from '@tradies/llm'
import {
  contentDocSchemaFor,
  safeParseSiteSpec,
  validateContentDocAgainstFacts,
  validateSpecAgainstFacts,
  validateSpecAgainstPreset,
  type BusinessFacts,
  type ContentDoc,
  type HtmlSpecDoc,
  type SiteSpec,
  type StoredSpec,
  type StylePreset,
  type ValidationReport,
} from '@tradies/site-spec'
import { recordLlmCost, type LlmCostRates } from './costs'
import { EVENT_TYPES } from './events'
import { buildRepairFeedback } from './repair-loop'
import { makeSlug, makeToken } from './slug'

const COMPONENT_PROMPT_VERSION = 'site-spec-v1'
const HTML_PROMPT_VERSION = 'content-doc-v1'

export class GenerationFailedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastProblems: string,
  ) {
    super(`site generation failed after ${attempts} attempts:\n${lastProblems}`)
    this.name = 'GenerationFailedError'
  }
}

export type GenerateSiteVersionResult = {
  stored: StoredSpec
  version: number
  siteId: string
  slug: string
  attempts: number
  reports: { fact: ValidationReport; preset: { ok: boolean; violations: string[] } }
}

export type GenerateSiteVersionInput = {
  db: Db
  /** Component-kind presets: emits a full SiteSpec. Ignored for html kind. */
  generator: SiteSpecGenerator
  /** Html-kind presets: emits a content doc for the preset's design template. */
  contentDocGenerator?: ContentDocGenerator
  prospectId: string
  facts: BusinessFacts
  preset: StylePreset
  stylePresetId?: string | null
  feedback?: string
  /** Deterministic slug override (fixture seeding); default derived + random suffix. */
  slug?: string
  maxAttempts?: number
  observer?: GenerationObserver
  costRates?: LlmCostRates
  previewTtlDays?: number
}

/**
 * THE generation path — CLI, seed, ops desk and the jobs pipeline all go
 * through here so validation and persistence can never diverge. Branches on
 * the preset's kind: 'component' runs generator → zod → FACT-GUARD →
 * design-system check; 'html' loads the preset's ingested design template and
 * runs contentDocGenerator → manifest-derived zod → FACT-GUARD. Both share
 * the same repair loop (≤ maxAttempts) and the same persistence tail:
 * site_specs v(n) + sites upsert + events + per-attempt cost rows.
 */
export async function generateSiteVersion(
  input: GenerateSiteVersionInput,
): Promise<GenerateSiteVersionResult> {
  if (input.preset.kind === 'html') return generateHtmlVersion(input)
  return generateComponentVersion(input)
}

async function generateComponentVersion(
  input: GenerateSiteVersionInput,
): Promise<GenerateSiteVersionResult> {
  const {
    db,
    generator,
    prospectId,
    facts,
    preset,
    maxAttempts = 3,
    observer = noopObserver,
  } = input

  let feedback = input.feedback
  let lastProblems = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    observer.onAttempt({ promptVersion: COMPONENT_PROMPT_VERSION, attempt, feedback })
    const result = await generator.generateSiteSpec({ facts, preset, feedback })
    if (input.costRates) {
      await recordLlmCost(db, {
        prospectId,
        usage: result.usage,
        rates: input.costRates,
        provider: result.model,
        ref: `${COMPONENT_PROMPT_VERSION}#${attempt}`,
      })
    }

    const parsed = safeParseSiteSpec(result.candidate)
    if (!parsed.success) {
      lastProblems = buildRepairFeedback({
        originalFeedback: input.feedback,
        zodError: parsed.error,
      })
      observer.onResult({ usage: result.usage, ok: false, problems: lastProblems })
      feedback = lastProblems
      continue
    }

    const factReport = validateSpecAgainstFacts(parsed.data)
    const presetReport = validateSpecAgainstPreset(parsed.data, preset)
    if (!factReport.ok || !presetReport.ok) {
      lastProblems = buildRepairFeedback({
        originalFeedback: input.feedback,
        factViolations: factReport.violations,
        presetViolations: presetReport.violations,
      })
      observer.onResult({ usage: result.usage, ok: false, problems: lastProblems })
      feedback = lastProblems
      continue
    }

    observer.onResult({ usage: result.usage, ok: true })
    const spec = parsed.data

    const persisted = await persistVersion(input, {
      spec,
      templateId: spec.templateId,
      designTemplateId: null,
      model: result.model,
      promptVersion: COMPONENT_PROMPT_VERSION,
      validationReport: { fact: factReport, preset: presetReport },
      eventPayload: {
        attempts: attempt,
        templateId: spec.templateId,
        styleKey: preset.styleKey,
        stylePresetId: input.stylePresetId ?? null,
        feedback: input.feedback ?? null,
      },
    })

    return {
      stored: { kind: 'component', spec },
      ...persisted,
      attempts: attempt,
      reports: { fact: factReport, preset: presetReport },
    }
  }

  await recordFailure(db, prospectId, maxAttempts, lastProblems)
  throw new GenerationFailedError(maxAttempts, lastProblems)
}

async function generateHtmlVersion(
  input: GenerateSiteVersionInput,
): Promise<GenerateSiteVersionResult> {
  const { db, prospectId, facts, preset, maxAttempts = 3, observer = noopObserver } = input

  const generator = input.contentDocGenerator
  if (!generator) {
    throw new Error(
      `preset "${preset.styleKey}" is an html design system — pass contentDocGenerator (resolveContentDocGeneratorFromEnv)`,
    )
  }
  if (!preset.designTemplateId) {
    throw new Error(`html preset "${preset.styleKey}" has no designTemplateId`)
  }
  const [template] = await db
    .select()
    .from(designTemplates)
    .where(eq(designTemplates.id, preset.designTemplateId))
    .limit(1)
  if (!template) throw new Error(`unknown design template ${preset.designTemplateId}`)
  if (template.status !== 'active') {
    throw new Error(`design template "${template.name}" is ${template.status}, not active`)
  }
  const manifest = template.slotManifest
  if (!manifest || !template.annotatedHtml) {
    throw new Error(`design template "${template.name}" has not been ingested`)
  }

  const schema = contentDocSchemaFor(manifest, { imageryPool: preset.imageryPool })

  let feedback = input.feedback
  let lastProblems = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    observer.onAttempt({ promptVersion: HTML_PROMPT_VERSION, attempt, feedback })
    const result = await generator.generateContentDoc({
      facts,
      manifest,
      imageryPool: preset.imageryPool,
      tone: preset.tone,
      sampleTexts: template.sampleTexts ?? {},
      feedback,
    })
    if (input.costRates) {
      await recordLlmCost(db, {
        prospectId,
        usage: result.usage,
        rates: input.costRates,
        provider: result.model,
        ref: `${HTML_PROMPT_VERSION}#${attempt}`,
      })
    }

    const parsed = schema.safeParse(result.candidate)
    if (!parsed.success) {
      lastProblems = buildRepairFeedback({
        originalFeedback: input.feedback,
        zodError: parsed.error,
      })
      observer.onResult({ usage: result.usage, ok: false, problems: lastProblems })
      feedback = lastProblems
      continue
    }

    // the manifest-derived schema guarantees this shape at runtime; zod's
    // dynamic z.object() just can't carry it in the type system
    const contentDoc = parsed.data as ContentDoc

    const factReport = validateContentDocAgainstFacts(contentDoc, manifest, facts)
    if (!factReport.ok) {
      lastProblems = buildRepairFeedback({
        originalFeedback: input.feedback,
        factViolations: factReport.violations,
      })
      observer.onResult({ usage: result.usage, ok: false, problems: lastProblems })
      feedback = lastProblems
      continue
    }

    observer.onResult({ usage: result.usage, ok: true })
    const doc: HtmlSpecDoc = {
      kind: 'html',
      designTemplateId: template.id,
      contentDoc,
      facts,
    }
    const presetReport = { ok: true, violations: [] as string[] }

    const persisted = await persistVersion(input, {
      spec: doc,
      templateId: 'html',
      designTemplateId: template.id,
      model: result.model,
      promptVersion: HTML_PROMPT_VERSION,
      validationReport: { fact: factReport, preset: presetReport },
      eventPayload: {
        attempts: attempt,
        templateId: 'html',
        designTemplateId: template.id,
        styleKey: preset.styleKey,
        stylePresetId: input.stylePresetId ?? null,
        feedback: input.feedback ?? null,
      },
    })

    return {
      stored: { kind: 'html', doc },
      ...persisted,
      attempts: attempt,
      reports: { fact: factReport, preset: presetReport },
    }
  }

  await recordFailure(db, prospectId, maxAttempts, lastProblems)
  throw new GenerationFailedError(maxAttempts, lastProblems)
}

/** Shared persistence tail: site_specs v(n) + sites upsert + spec_generated event. */
async function persistVersion(
  input: GenerateSiteVersionInput,
  data: {
    spec: SiteSpec | HtmlSpecDoc
    templateId: string
    designTemplateId: string | null
    model: string
    promptVersion: string
    validationReport: { fact: ValidationReport; preset: { ok: boolean; violations: string[] } }
    eventPayload: Record<string, unknown>
  },
): Promise<{ version: number; siteId: string; slug: string }> {
  const { db, prospectId, facts } = input

  const [latest] = await db
    .select({ version: siteSpecs.version })
    .from(siteSpecs)
    .where(eq(siteSpecs.prospectId, prospectId))
    .orderBy(desc(siteSpecs.version))
    .limit(1)
  const version = (latest?.version ?? 0) + 1

  await db.insert(siteSpecs).values({
    prospectId,
    version,
    spec: data.spec,
    templateId: data.templateId,
    stylePresetId: input.stylePresetId ?? null,
    designTemplateId: data.designTemplateId,
    model: data.model,
    promptVersion: data.promptVersion,
    validationReport: data.validationReport,
    generatedBy: 'llm',
    regenerateFeedback: input.feedback ?? null,
  })

  const [existing] = await db.select().from(sites).where(eq(sites.prospectId, prospectId)).limit(1)
  let siteId: string
  let slug: string
  if (existing) {
    siteId = existing.id
    slug = existing.slug
    await db.update(sites).set({ currentSpecVersion: version }).where(eq(sites.id, existing.id))
  } else {
    slug = input.slug ?? makeSlug(facts.businessName)
    const ttlDays = input.previewTtlDays ?? Number(process.env.PREVIEW_TTL_DAYS ?? 30)
    const [created] = await db
      .insert(sites)
      .values({
        prospectId,
        slug,
        currentSpecVersion: version,
        status: 'preview',
        noindex: true,
        claimToken: makeToken('claim'),
        portalToken: makeToken('portal'),
        previewExpiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      })
      .returning()
    if (!created) throw new Error('failed to create site row')
    siteId = created.id
  }

  await db.insert(events).values({
    prospectId,
    siteId,
    actor: 'system',
    type: EVENT_TYPES.specGenerated,
    payload: { version, ...data.eventPayload },
  })

  return { version, siteId, slug }
}

async function recordFailure(
  db: Db,
  prospectId: string,
  attempts: number,
  problems: string,
): Promise<void> {
  await db.insert(events).values({
    prospectId,
    actor: 'system',
    type: EVENT_TYPES.generationFailed,
    payload: { attempts, problems },
  })
}
