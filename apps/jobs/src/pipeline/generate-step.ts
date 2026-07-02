import { eq } from 'drizzle-orm'
import { prospects, type Db } from '@tradies/db'
import {
  generateSiteVersion,
  prospectToFacts,
  presetFromRow,
  resolveActivePreset,
  resolveCostRatesFromEnv,
  resolveGeneratorFromEnv,
  type GenerateSiteVersionResult,
} from '@tradies/engine'
import type { SiteSpecGenerator } from '@tradies/llm'
import { stylePresets } from '@tradies/db'

/** Pipeline wrapper around the shared engine — same path as ops/CLI. */
export async function generateSiteSpecStep(
  db: Db,
  input: {
    prospectId: string
    styleKey?: string
    stylePresetId?: string
    feedback?: string
    generator?: SiteSpecGenerator
  },
): Promise<GenerateSiteVersionResult> {
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1)
  if (!prospect) throw new Error(`unknown prospect ${input.prospectId}`)

  let preset
  let presetId: string | null = null
  if (input.stylePresetId) {
    const [row] = await db
      .select()
      .from(stylePresets)
      .where(eq(stylePresets.id, input.stylePresetId))
      .limit(1)
    if (!row) throw new Error(`unknown style preset ${input.stylePresetId}`)
    preset = presetFromRow(row)
    presetId = row.id
  } else {
    const resolved = await resolveActivePreset(
      db,
      input.styleKey ?? 'modern',
      prospect.trade ?? 'other',
    )
    if (!resolved) throw new Error(`no active preset for style "${input.styleKey ?? 'modern'}"`)
    preset = resolved.preset
    presetId = resolved.presetId
  }

  await db.update(prospects).set({ status: 'generating' }).where(eq(prospects.id, prospect.id))
  const result = await generateSiteVersion({
    db,
    generator: input.generator ?? resolveGeneratorFromEnv(),
    prospectId: prospect.id,
    facts: prospectToFacts(prospect),
    preset,
    stylePresetId: presetId,
    feedback: input.feedback,
    costRates: resolveCostRatesFromEnv(),
  })
  await db.update(prospects).set({ status: 'in_review' }).where(eq(prospects.id, prospect.id))
  return result
}
