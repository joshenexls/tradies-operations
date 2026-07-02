'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { stylePresets } from '@tradies/db/schema'
import { stylePresetSchema } from '@tradies/site-spec'
import { getDb } from '@/lib/db'

export type PresetFormData = {
  styleKey: string
  name: string
  /** '' | trade — '' means generic (stored as NULL). */
  trade: string
  templateId: string
  description: string
  paletteId: string
  fontPairId: string
  radius: string
  tone: string
  imageryPool: string
  preferredSections: string[]
  /** kind → variant → weight. A kind with no entries means "all variants allowed". */
  variantWeights: Record<string, Record<string, number>>
  status: string
}

export type SavePresetResult = { ok: true; id: string } | { error: string }

export async function savePreset(
  id: string | null,
  form: PresetFormData,
): Promise<SavePresetResult> {
  const db = getDb()
  const parsed = stylePresetSchema.safeParse({
    styleKey: form.styleKey.trim(),
    name: form.name.trim(),
    trade: form.trade === '' ? null : form.trade,
    templateId: form.templateId,
    description: form.description.trim() || undefined,
    paletteId: form.paletteId,
    fontPairId: form.fontPairId,
    radius: form.radius,
    tone: form.tone,
    imageryPool: form.imageryPool.trim(),
    preferredSections: form.preferredSections.length > 0 ? form.preferredSections : undefined,
    variantWeights: coerceWeights(form.variantWeights),
    status: form.status,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'preset'}: ${issue.message}`)
      .join('; ')
    return { error: `Invalid preset — ${issues}` }
  }
  const preset = parsed.data
  const values = {
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
  }

  try {
    if (id) {
      const [updated] = await db
        .update(stylePresets)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(stylePresets.id, id))
        .returning()
      if (!updated) return { error: 'Preset not found' }
    } else {
      const [created] = await db
        .insert(stylePresets)
        .values({ ...values, createdBy: 'operator' })
        .returning()
      if (!created) return { error: 'Failed to create preset' }
      id = created.id
    }
  } catch (err) {
    if (isStyleKeyConflict(err)) {
      return {
        error: `A "${preset.styleKey}" system already exists for ${preset.trade ?? 'generic'} — style key + trade must be unique`,
      }
    }
    throw err
  }

  revalidatePath('/library')
  revalidatePath(`/library/${id}`)
  return { ok: true, id }
}

export type PresetActionResult = { ok: true; id: string } | { error: string }

export async function clonePreset(id: string): Promise<PresetActionResult> {
  const db = getDb()
  const [row] = await db.select().from(stylePresets).where(eq(stylePresets.id, id)).limit(1)
  if (!row) return { error: 'Preset not found' }
  // styleKey max length is 32 — keep the '-copy' suffix within it
  const styleKey = `${row.styleKey.slice(0, 27)}-copy`
  try {
    const [created] = await db
      .insert(stylePresets)
      .values({
        styleKey,
        name: `${row.name} (copy)`.slice(0, 60),
        trade: row.trade,
        templateId: row.templateId,
        description: row.description,
        paletteId: row.paletteId,
        fontPairId: row.fontPairId,
        radius: row.radius,
        variantWeights: row.variantWeights,
        preferredSections: row.preferredSections,
        imageryPool: row.imageryPool,
        tone: row.tone,
        status: 'draft',
        createdBy: 'operator',
      })
      .returning()
    if (!created) return { error: 'Failed to clone preset' }
    revalidatePath('/library')
    return { ok: true, id: created.id }
  } catch (err) {
    if (isStyleKeyConflict(err)) {
      return {
        error: `A "${styleKey}" system already exists for this trade — edit that copy instead`,
      }
    }
    throw err
  }
}

export async function setPresetStatus(
  id: string,
  status: 'active' | 'draft' | 'retired',
): Promise<PresetActionResult> {
  const db = getDb()
  const [updated] = await db
    .update(stylePresets)
    .set({ status, updatedAt: new Date() })
    .where(eq(stylePresets.id, id))
    .returning()
  if (!updated) return { error: 'Preset not found' }
  revalidatePath('/library')
  revalidatePath(`/library/${id}`)
  return { ok: true, id }
}

function coerceWeights(
  weights: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  for (const [kind, variants] of Object.entries(weights)) {
    const entries = Object.entries(variants).filter(([, weight]) => Number.isFinite(weight))
    if (entries.length === 0) continue
    result[kind] = Object.fromEntries(entries.map(([variant, weight]) => [variant, Number(weight)]))
  }
  return result
}

function isStyleKeyConflict(err: unknown): boolean {
  const text = `${String(err)} ${String((err as Error | undefined)?.cause ?? '')}`
  return /style_presets_style_key_trade_unique/.test(text)
}
