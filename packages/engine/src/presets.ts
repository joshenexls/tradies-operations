import { and, eq } from 'drizzle-orm'
import { stylePresets, type Db, type StylePresetRow } from '@tradies/db'
import {
  resolveStylePreset,
  stylePresetSchema,
  type StylePreset,
  type Trade,
} from '@tradies/site-spec'
import { SEED_STYLE_PRESETS } from '@tradies/templates'

/** DB row → validated StylePreset (throws on a corrupted row). */
export function presetFromRow(row: StylePresetRow): StylePreset {
  return stylePresetSchema.parse({
    styleKey: row.styleKey,
    name: row.name,
    trade: row.trade,
    templateId: row.templateId,
    description: row.description ?? undefined,
    paletteId: row.paletteId,
    fontPairId: row.fontPairId,
    radius: row.radius ?? 'soft',
    variantWeights: row.variantWeights ?? {},
    preferredSections: row.preferredSections ?? undefined,
    imageryPool: row.imageryPool,
    tone: row.tone,
    status: row.status,
    kind: row.kind,
    designTemplateId: row.designTemplateId,
  })
}

/**
 * System × trade resolution against the live library: trade specialisation
 * wins, generic falls back — same rule as resolveStylePreset, but sourced
 * from the DB so operator-curated systems apply without redeploys.
 */
export async function resolveActivePreset(
  db: Db,
  styleKey: string,
  trade: Trade,
): Promise<{ preset: StylePreset; presetId: string } | undefined> {
  const rows = await db
    .select()
    .from(stylePresets)
    .where(and(eq(stylePresets.styleKey, styleKey), eq(stylePresets.status, 'active')))
  const presets = rows.map(presetFromRow)
  const resolved = resolveStylePreset(presets, styleKey, trade)
  if (!resolved) return undefined
  const row = rows.find((r) => r.trade === resolved.trade)
  if (!row) return undefined
  return { preset: resolved, presetId: row.id }
}

export async function listActivePresets(
  db: Db,
): Promise<{ row: StylePresetRow; preset: StylePreset }[]> {
  const rows = await db.select().from(stylePresets).where(eq(stylePresets.status, 'active'))
  return rows.map((row) => ({ row, preset: presetFromRow(row) }))
}

/** Idempotent first-run seeding of the library from the shipped systems. */
export async function seedStylePresets(db: Db): Promise<void> {
  await db
    .insert(stylePresets)
    .values(
      SEED_STYLE_PRESETS.map((preset) => ({
        styleKey: preset.styleKey,
        name: preset.name,
        trade: preset.trade,
        templateId: preset.templateId,
        description: preset.description ?? null,
        paletteId: preset.paletteId,
        fontPairId: preset.fontPairId,
        radius: preset.radius,
        variantWeights: preset.variantWeights,
        preferredSections: preset.preferredSections ?? null,
        imageryPool: preset.imageryPool,
        tone: preset.tone,
        status: preset.status,
      })),
    )
    .onConflictDoNothing()
}
