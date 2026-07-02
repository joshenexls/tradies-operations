import { z } from 'zod'
import { SECTION_KINDS, SECTION_VARIANTS, type SectionKind } from './sections'
import { fontPairIds, paletteIds } from './theme'
import { tradeSchema } from './trades'

/**
 * A StylePreset is a "design system" the operator curates in the library:
 * a named direction ("modern", "heritage", "bold") that is either generic
 * (trade = null) or specialised for one trade. The generation engine NEVER
 * free-styles design decisions — it receives one resolved preset and may only:
 *   - use the preset's palette + font pair,
 *   - choose section variants the preset allows (weighted),
 *   - pull imagery from the preset's pool,
 *   - write copy in the preset's tone.
 * Selecting "modern + plumber" resolves to the plumber-specialised preset if
 * one exists, else the generic "modern" one. Presets live in the DB (operator
 * adds without redeploys); the seed set ships from @tradies/templates.
 */

const weightMap = z.record(z.string(), z.number().min(0).max(1))

export const stylePresetSchema = z.object({
  /** Style direction key, e.g. "modern" — shared across trade specialisations. */
  styleKey: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(60),
  /** null = generic (any trade); otherwise a trade specialisation. */
  trade: tradeSchema.nullable(),
  /** Template family in @tradies/templates that renders this system. */
  templateId: z.string().min(1),
  description: z.string().max(300).optional(),
  paletteId: z.enum(paletteIds),
  fontPairId: z.enum(fontPairIds),
  radius: z.enum(['sharp', 'soft', 'round']).default('soft'),
  /**
   * Per section kind: allowed variants with selection weights. A kind that is
   * absent keeps all template variants available at equal weight; a variant
   * with weight 0 is forbidden.
   */
  variantWeights: z.partialRecord(z.enum(SECTION_KINDS), weightMap).default({}),
  /** Preferred section order/inclusion (subset; hero/contact implied). */
  preferredSections: z.array(z.enum(SECTION_KINDS)).max(9).optional(),
  /** Curated R2 imagery pool id, e.g. "plumbing-modern". */
  imageryPool: z.string().min(2).max(64),
  tone: z.enum(['friendly', 'professional', 'premium', 'no-nonsense']),
  status: z.enum(['active', 'draft', 'retired']).default('active'),
  /**
   * 'component' = the legacy React template families; 'html' = an uploaded
   * HTML design system (skeleton + fresh per-business content).
   */
  kind: z.enum(['component', 'html']).default('component'),
  /** Required when kind === 'html' — the ingested design_templates row. */
  designTemplateId: z.string().uuid().nullable().default(null),
})

export type StylePreset = z.infer<typeof stylePresetSchema>

/**
 * Resolve a style direction for a trade: exact trade specialisation wins,
 * generic fallback otherwise. `presets` is whatever is active in the library.
 */
export function resolveStylePreset(
  presets: readonly StylePreset[],
  styleKey: string,
  trade: z.infer<typeof tradeSchema>,
): StylePreset | undefined {
  const candidates = presets.filter((p) => p.styleKey === styleKey && p.status === 'active')
  return candidates.find((p) => p.trade === trade) ?? candidates.find((p) => p.trade === null)
}

/**
 * The concrete design constraints handed to the generator for one run —
 * a resolved preset flattened into "what the LLM is allowed to pick".
 */
export function presetConstraints(preset: StylePreset): {
  templateId: string
  paletteId: string
  fontPairId: string
  radius: 'sharp' | 'soft' | 'round'
  allowedVariants: Record<SectionKind, string[]>
  imageryPool: string
  tone: StylePreset['tone']
  preferredSections?: SectionKind[]
} {
  const allowedVariants = {} as Record<SectionKind, string[]>
  for (const kind of SECTION_KINDS) {
    const weights = preset.variantWeights[kind]
    const all = SECTION_VARIANTS[kind]
    allowedVariants[kind] = weights ? all.filter((v) => (weights[v] ?? 0) > 0) : [...all]
    // a preset must never forbid every variant of a kind it prefers
    if (allowedVariants[kind].length === 0) allowedVariants[kind] = [...all]
  }
  return {
    templateId: preset.templateId,
    paletteId: preset.paletteId,
    fontPairId: preset.fontPairId,
    radius: preset.radius,
    allowedVariants,
    imageryPool: preset.imageryPool,
    tone: preset.tone,
    preferredSections: preset.preferredSections ? [...preset.preferredSections] : undefined,
  }
}

/**
 * Check a generated spec obeyed its preset: right palette/fonts and only
 * allowed variants. Run alongside FACT-GUARD before persisting.
 */
export function validateSpecAgainstPreset(
  spec: {
    templateId: string
    theme: { paletteId: string; fontPairId: string }
    sections: { kind: SectionKind; variant: string }[]
  },
  preset: StylePreset,
): { ok: boolean; violations: string[] } {
  const violations: string[] = []
  const constraints = presetConstraints(preset)
  if (spec.templateId !== constraints.templateId)
    violations.push(`template ${spec.templateId} != preset template ${constraints.templateId}`)
  if (spec.theme.paletteId !== constraints.paletteId)
    violations.push(`palette ${spec.theme.paletteId} != preset palette ${constraints.paletteId}`)
  if (spec.theme.fontPairId !== constraints.fontPairId)
    violations.push(
      `fontPair ${spec.theme.fontPairId} != preset fontPair ${constraints.fontPairId}`,
    )
  for (const section of spec.sections) {
    if (!constraints.allowedVariants[section.kind]?.includes(section.variant))
      violations.push(`section ${section.kind}: variant "${section.variant}" not allowed by preset`)
  }
  return { ok: violations.length === 0, violations }
}
