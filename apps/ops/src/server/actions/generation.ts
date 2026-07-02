'use server'

import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { prospects, reviewBatches, reviewRequests, sites, stylePresets } from '@tradies/db/schema'
import {
  GenerationFailedError,
  generateSiteVersion,
  presetFromRow,
  prospectToFacts,
  resolveActivePreset,
  resolveCostRatesFromEnv,
  resolveGeneratorFromEnv,
} from '@tradies/engine'
import type { StylePreset } from '@tradies/site-spec'
import { getDb } from '@/lib/db'

export type GenerateResult = { ok: true; version: number; slug: string } | { error: string }

export async function generateForProspect(
  prospectId: string,
  opts: { presetId?: string; styleKey?: string; feedback?: string } = {},
): Promise<GenerateResult> {
  const db = getDb()
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
  if (!prospect) return { error: 'Prospect not found' }
  if (!prospect.trade) return { error: 'Prospect has no trade — set one before generating' }

  let preset: StylePreset
  let stylePresetId: string
  if (opts.presetId) {
    const [row] = await db
      .select()
      .from(stylePresets)
      .where(eq(stylePresets.id, opts.presetId))
      .limit(1)
    if (!row) return { error: 'Style preset not found' }
    preset = presetFromRow(row)
    stylePresetId = row.id
  } else {
    const styleKey = opts.styleKey ?? 'modern'
    const resolved = await resolveActivePreset(db, styleKey, prospect.trade)
    if (!resolved) return { error: `No active design system for style "${styleKey}"` }
    preset = resolved.preset
    stylePresetId = resolved.presetId
  }

  try {
    const result = await generateSiteVersion({
      db,
      generator: resolveGeneratorFromEnv(),
      prospectId,
      facts: prospectToFacts(prospect),
      preset,
      stylePresetId,
      feedback: opts.feedback,
      costRates: resolveCostRatesFromEnv(),
    })
    await db
      .update(prospects)
      .set({ status: 'in_review', updatedAt: new Date() })
      .where(eq(prospects.id, prospectId))
    revalidatePath('/pipeline')
    revalidatePath(`/prospects/${prospectId}`)
    return { ok: true, version: result.version, slug: result.slug }
  } catch (err) {
    // generation failure is an expected operational outcome, not a crash
    if (err instanceof GenerationFailedError) return { error: err.message }
    throw err
  }
}

export type BatchGenerateResult = {
  ok: true
  generated: number
  failures: { prospectId: string; error: string }[]
}

/** Sequential on purpose: PGlite is a single connection — never Promise.all here. */
export async function generateBatch(prospectIds: string[]): Promise<BatchGenerateResult> {
  const failures: { prospectId: string; error: string }[] = []
  let generated = 0
  for (const prospectId of prospectIds) {
    const result = await generateForProspect(prospectId)
    if ('error' in result) failures.push({ prospectId, error: result.error })
    else generated++
  }
  revalidatePath('/pipeline')
  return { ok: true, generated, failures }
}

export type AddToBatchResult =
  { ok: true; batchId: string; added: number; skipped: number } | { error: string }

export async function addToReviewBatch(
  prospectIds: string[],
  opts: { label: string; autoApprove: boolean },
): Promise<AddToBatchResult> {
  const db = getDb()
  if (prospectIds.length === 0) return { error: 'No prospects selected' }
  const siteRows = await db
    .select({ prospectId: sites.prospectId })
    .from(sites)
    .where(inArray(sites.prospectId, prospectIds))
  const withSites = new Set(siteRows.map((r) => r.prospectId))
  const eligible = prospectIds.filter((id) => withSites.has(id))
  if (eligible.length === 0) {
    return { error: 'None of the selected prospects has a generated site yet — generate first' }
  }

  const [batch] = await db
    .insert(reviewBatches)
    .values({
      label: opts.label || 'Untitled batch',
      autoApprove: opts.autoApprove,
      status: 'open',
    })
    .returning()
  if (!batch) return { error: 'Failed to create review batch' }
  for (const prospectId of eligible) {
    await db
      .insert(reviewRequests)
      .values({ batchId: batch.id, prospectId, kind: 'site', status: 'pending' })
  }
  revalidatePath('/review')
  return {
    ok: true,
    batchId: batch.id,
    added: eligible.length,
    skipped: prospectIds.length - eligible.length,
  }
}
