import { eq } from 'drizzle-orm'
import type { Db } from '@tradies/db'
import { designTemplates, stylePresets } from '@tradies/db/schema'
import {
  annotationOpSchema,
  applyAnnotations,
  extractDesignTokens,
  sanitizeHtml,
  validateAnnotatedTemplate,
  type AnnotationOpInput,
  type SanitizationReport,
} from '@tradies/html-templates'
import { resolveIngestRepairFeedback, type TemplateIngestor, type TokenUsage } from '@tradies/llm'
import type { StylePreset, Trade } from '@tradies/site-spec'

/**
 * Design-template ingest: uploaded lander HTML → sanitize → LLM-located
 * annotation ops → deterministic apply + validate, with a bounded repair
 * loop. Pure (db + ingestor injected) so vitest exercises the whole flow;
 * the 'use server' wrappers live in ../actions/templates.ts.
 *
 * Nothing the LLM emits is trusted: every candidate op is re-parsed through
 * html-templates' annotationOpSchema, applied deterministically, and the
 * result gated by validateAnnotatedTemplate before any row is written.
 */

const DEFAULT_MAX_UPLOAD_KB = 512
/** Initial attempt + 2 repairs. */
const MAX_INGEST_ATTEMPTS = 3

export type IngestTemplateInput = {
  name: string
  rawHtml: string
  componentsHtml?: string
  styleKey: string
  /** null = generic (any trade). */
  trade: Trade | null
  imageryPool: string
  tone: StylePreset['tone']
  createdBy: string
}

export type IngestTemplateFailure = {
  ok: false
  code: 'too-large' | 'style-key-conflict' | 'ingest-failed'
  message: string
  /** Last attempt's problems (schema + unmatched + validation), newest attempt only. */
  problems: string[]
  sanitizationReport: SanitizationReport | null
  attempts: number
}

export type IngestTemplateResult =
  { ok: true; templateId: string; presetId: string } | IngestTemplateFailure

export type TemplateActionResult = { ok: true; templateId: string } | { error: string }

export function resolveMaxUploadKb(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.TEMPLATE_MAX_UPLOAD_KB)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_KB
}

type IngestRunSuccess = {
  ok: true
  annotatedHtml: string
  manifest: ReturnType<typeof applyAnnotations>['manifest']
  sampleTexts: Record<string, string>
  sanitizationReport: SanitizationReport
  validationReport: { ok: boolean; problems: string[] }
  tokens: { palette: string[]; fonts: string[] }
  ingestModel: string
  ingestUsage: TokenUsage
  attempts: number
}

type IngestRunFailure = {
  ok: false
  problems: string[]
  sanitizationReport: SanitizationReport
  attempts: number
}

/**
 * The shared sanitize → annotate → apply → validate loop (upload + re-ingest).
 * The ingestor sees the RAW upload (that is what the operator pasted and what
 * the fixture ingestor's html-match resolves against); ops are applied to the
 * sanitized DOM, so selectors into removed content simply come back unmatched.
 */
async function runIngest(
  ingestor: TemplateIngestor,
  name: string,
  rawHtml: string,
): Promise<IngestRunSuccess | IngestRunFailure> {
  const { html: sanitizedHtml, report: sanitizationReport } = sanitizeHtml(rawHtml)

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let model = ''
  let feedback: string | undefined
  let problems: string[] = []
  let attempts = 0

  for (attempts = 1; attempts <= MAX_INGEST_ATTEMPTS; attempts++) {
    let candidate: unknown
    try {
      const result = await ingestor.annotate({ html: rawHtml, hints: { name }, feedback })
      candidate = result.candidate
      model = result.model
      usage.inputTokens += result.usage.inputTokens
      usage.outputTokens += result.usage.outputTokens
    } catch (err) {
      // transport/resolution failure (e.g. fixture ingestor with an unknown
      // lander) — deterministic, so retrying cannot help
      return {
        ok: false,
        problems: [`ingestor error: ${err instanceof Error ? err.message : String(err)}`],
        sanitizationReport,
        attempts,
      }
    }

    // SOURCE OF TRUTH: html-templates' annotationOpSchema, op by op
    const schemaProblems: string[] = []
    const validOps: AnnotationOpInput[] = []
    const rawOps =
      typeof candidate === 'object' && candidate !== null && 'ops' in candidate
        ? (candidate as { ops: unknown }).ops
        : undefined
    if (!Array.isArray(rawOps)) {
      schemaProblems.push('candidate is not an { ops: [...] } object')
    } else {
      rawOps.forEach((op, index) => {
        const parsed = annotationOpSchema.safeParse(op)
        if (parsed.success) {
          validOps.push(parsed.data)
        } else {
          const issues = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'op'}: ${issue.message}`)
            .join('; ')
          schemaProblems.push(`op[${index}] failed schema: ${issues} — ${JSON.stringify(op)}`)
        }
      })
    }

    const { annotatedHtml, manifest, sampleTexts, unmatched } = applyAnnotations(
      sanitizedHtml,
      validOps,
    )
    const validation = validateAnnotatedTemplate(annotatedHtml, manifest)

    if (schemaProblems.length === 0 && unmatched.length === 0 && validation.ok) {
      return {
        ok: true,
        annotatedHtml,
        manifest,
        sampleTexts,
        sanitizationReport,
        validationReport: validation,
        tokens: extractDesignTokens(sanitizedHtml),
        ingestModel: model,
        ingestUsage: usage,
        attempts,
      }
    }
    problems = [
      ...schemaProblems,
      ...unmatched.map((op) => `op did not match the sanitized DOM: ${JSON.stringify(op)}`),
      ...validation.problems,
    ]
    feedback = resolveIngestRepairFeedback(unmatched, [...schemaProblems, ...validation.problems])
  }

  return { ok: false, problems, sanitizationReport, attempts: MAX_INGEST_ATTEMPTS }
}

export async function ingestTemplate({
  db,
  ingestor,
  input,
  maxUploadKb = resolveMaxUploadKb(),
}: {
  db: Db
  ingestor: TemplateIngestor
  input: IngestTemplateInput
  /** Override for tests; defaults to TEMPLATE_MAX_UPLOAD_KB (512 when unset). */
  maxUploadKb?: number
}): Promise<IngestTemplateResult> {
  const uploadedBytes =
    Buffer.byteLength(input.rawHtml) + Buffer.byteLength(input.componentsHtml ?? '')
  if (uploadedBytes > maxUploadKb * 1024) {
    return {
      ok: false,
      code: 'too-large',
      message: `Upload is ${Math.ceil(uploadedBytes / 1024)} KB — the limit is ${maxUploadKb} KB (TEMPLATE_MAX_UPLOAD_KB)`,
      problems: [],
      sanitizationReport: null,
      attempts: 0,
    }
  }

  const run = await runIngest(ingestor, input.name, input.rawHtml)
  if (!run.ok) {
    return {
      ok: false,
      code: 'ingest-failed',
      message: `Ingest failed after ${run.attempts} attempt(s) — the annotated template never validated`,
      problems: run.problems,
      sanitizationReport: run.sanitizationReport,
      attempts: run.attempts,
    }
  }

  const [template] = await db
    .insert(designTemplates)
    .values({
      name: input.name,
      rawHtml: input.rawHtml,
      componentsHtml: input.componentsHtml ?? null,
      annotatedHtml: run.annotatedHtml,
      slotManifest: run.manifest,
      tokens: run.tokens,
      sampleTexts: run.sampleTexts,
      sanitizationReport: run.sanitizationReport,
      validationReport: run.validationReport,
      ingestModel: run.ingestModel,
      ingestUsage: run.ingestUsage,
      status: 'draft',
      createdBy: input.createdBy,
    })
    .returning()
  if (!template) throw new Error('failed to insert design template')

  let preset
  try {
    ;[preset] = await db
      .insert(stylePresets)
      .values({
        styleKey: input.styleKey,
        name: input.name,
        trade: input.trade,
        templateId: 'html',
        paletteId: 'graphite-amber',
        fontPairId: 'manrope-manrope',
        radius: 'soft',
        variantWeights: {},
        imageryPool: input.imageryPool,
        tone: input.tone,
        status: 'draft',
        kind: 'html',
        designTemplateId: template.id,
        createdBy: input.createdBy,
      })
      .returning()
  } catch (err) {
    // don't leave an orphan template behind a (styleKey, trade) unique conflict
    await db.delete(designTemplates).where(eq(designTemplates.id, template.id))
    if (isStyleKeyConflict(err)) {
      return {
        ok: false,
        code: 'style-key-conflict',
        message: `A "${input.styleKey}" system already exists for ${input.trade ?? 'generic'} — style key + trade must be unique`,
        problems: [],
        sanitizationReport: run.sanitizationReport,
        attempts: run.attempts,
      }
    }
    throw err
  }
  if (!preset) throw new Error('failed to insert style preset')

  return { ok: true, templateId: template.id, presetId: preset.id }
}

/**
 * Template + preset(s) → active. Refuses when the stored validation report is
 * not ok (a failed re-ingest may have been recorded) — an active html preset
 * must always point at a renderable template. Idempotent.
 */
export async function activateTemplate(db: Db, templateId: string): Promise<TemplateActionResult> {
  const [row] = await db
    .select()
    .from(designTemplates)
    .where(eq(designTemplates.id, templateId))
    .limit(1)
  if (!row) return { error: 'Template not found' }
  if (!row.annotatedHtml || !row.slotManifest || row.validationReport?.ok !== true) {
    return { error: 'Template has not passed validation — re-ingest it before activating' }
  }
  await db
    .update(designTemplates)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(designTemplates.id, templateId))
  await db
    .update(stylePresets)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(stylePresets.designTemplateId, templateId))
  return { ok: true, templateId }
}

/** Template + preset(s) → retired. Idempotent. */
export async function retireTemplate(db: Db, templateId: string): Promise<TemplateActionResult> {
  const [row] = await db
    .select({ id: designTemplates.id })
    .from(designTemplates)
    .where(eq(designTemplates.id, templateId))
    .limit(1)
  if (!row) return { error: 'Template not found' }
  await db
    .update(designTemplates)
    .set({ status: 'retired', updatedAt: new Date() })
    .where(eq(designTemplates.id, templateId))
  await db
    .update(stylePresets)
    .set({ status: 'retired', updatedAt: new Date() })
    .where(eq(stylePresets.designTemplateId, templateId))
  return { ok: true, templateId }
}

export type ReingestTemplateResult =
  | { ok: true; templateId: string }
  | { ok: false; templateId?: string; message: string; problems: string[] }

/**
 * Re-run sanitize + annotate on the STORED rawHtml, updating the row in
 * place. Draft stays draft; an active template stays active only when the
 * fresh run validates — otherwise it (and its presets) flip to draft with the
 * failure recorded in validationReport.
 */
export async function reingestTemplate({
  db,
  ingestor,
  templateId,
}: {
  db: Db
  ingestor: TemplateIngestor
  templateId: string
}): Promise<ReingestTemplateResult> {
  const [row] = await db
    .select()
    .from(designTemplates)
    .where(eq(designTemplates.id, templateId))
    .limit(1)
  if (!row) return { ok: false, message: 'Template not found', problems: [] }

  const run = await runIngest(ingestor, row.name, row.rawHtml)
  if (run.ok) {
    await db
      .update(designTemplates)
      .set({
        annotatedHtml: run.annotatedHtml,
        slotManifest: run.manifest,
        tokens: run.tokens,
        sampleTexts: run.sampleTexts,
        sanitizationReport: run.sanitizationReport,
        validationReport: run.validationReport,
        ingestModel: run.ingestModel,
        ingestUsage: run.ingestUsage,
        updatedAt: new Date(),
      })
      .where(eq(designTemplates.id, templateId))
    return { ok: true, templateId }
  }

  // record the failure; a previously-active template may no longer be trusted
  await db
    .update(designTemplates)
    .set({
      sanitizationReport: run.sanitizationReport,
      validationReport: { ok: false, problems: run.problems },
      ...(row.status === 'active' ? { status: 'draft' as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(designTemplates.id, templateId))
  if (row.status === 'active') {
    await db
      .update(stylePresets)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(stylePresets.designTemplateId, templateId))
  }
  return {
    ok: false,
    templateId,
    message: `Re-ingest failed after ${run.attempts} attempt(s) — failure recorded on the template`,
    problems: run.problems,
  }
}

function isStyleKeyConflict(err: unknown): boolean {
  const text = `${String(err)} ${String((err as Error | undefined)?.cause ?? '')}`
  return /style_presets_style_key_trade_unique/.test(text)
}
