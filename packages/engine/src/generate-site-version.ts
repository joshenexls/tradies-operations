import { desc, eq } from 'drizzle-orm'
import { events, sites, siteSpecs, type Db } from '@tradies/db'
import type { SiteSpecGenerator } from '@tradies/llm'
import { noopObserver, type GenerationObserver } from '@tradies/llm'
import {
  safeParseSiteSpec,
  validateSpecAgainstFacts,
  validateSpecAgainstPreset,
  type BusinessFacts,
  type SiteSpec,
  type StylePreset,
  type ValidationReport,
} from '@tradies/site-spec'
import { recordLlmCost, type LlmCostRates } from './costs'
import { EVENT_TYPES } from './events'
import { buildRepairFeedback } from './repair-loop'
import { makeSlug, makeToken } from './slug'

const PROMPT_VERSION = 'site-spec-v1'

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
  spec: SiteSpec
  version: number
  siteId: string
  slug: string
  attempts: number
  reports: { fact: ValidationReport; preset: { ok: boolean; violations: string[] } }
}

/**
 * THE generation path — CLI, seed, ops desk and the jobs pipeline all go
 * through here so validation and persistence can never diverge: generator →
 * zod → FACT-GUARD → design-system check → repair loop (≤ maxAttempts) →
 * site_specs v(n) + sites upsert + events + per-attempt cost rows.
 */
export async function generateSiteVersion(input: {
  db: Db
  generator: SiteSpecGenerator
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
}): Promise<GenerateSiteVersionResult> {
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
    observer.onAttempt({ promptVersion: PROMPT_VERSION, attempt, feedback })
    const result = await generator.generateSiteSpec({ facts, preset, feedback })
    if (input.costRates) {
      await recordLlmCost(db, {
        prospectId,
        usage: result.usage,
        rates: input.costRates,
        provider: result.model,
        ref: `${PROMPT_VERSION}#${attempt}`,
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
      spec,
      templateId: spec.templateId,
      stylePresetId: input.stylePresetId ?? null,
      model: result.model,
      promptVersion: PROMPT_VERSION,
      validationReport: { fact: factReport, preset: presetReport },
      generatedBy: 'llm',
      regenerateFeedback: input.feedback ?? null,
    })

    const [existing] = await db
      .select()
      .from(sites)
      .where(eq(sites.prospectId, prospectId))
      .limit(1)
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
      payload: {
        version,
        attempts: attempt,
        templateId: spec.templateId,
        styleKey: preset.styleKey,
        stylePresetId: input.stylePresetId ?? null,
        feedback: input.feedback ?? null,
      },
    })

    return {
      spec,
      version,
      siteId,
      slug,
      attempts: attempt,
      reports: { fact: factReport, preset: presetReport },
    }
  }

  await db.insert(events).values({
    prospectId,
    actor: 'system',
    type: EVENT_TYPES.generationFailed,
    payload: { attempts: maxAttempts, problems: lastProblems },
  })
  throw new GenerationFailedError(maxAttempts, lastProblems)
}
