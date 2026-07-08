import { FONT_PAIRS, PALETTES, TRADES } from '@tradies/site-spec'
import { TEMPLATES, listSectionVariants } from '@tradies/templates'

export type PresetFormOptions = {
  templateIds: string[]
  palettes: { id: string; name: string; colors: string[] }[]
  fontPairs: { id: string; name: string }[]
  trades: string[]
  sectionVariants: Record<string, string[]>
}

/** Serializable option lists for the client-side preset form. */
export function presetFormOptions(): PresetFormOptions {
  return {
    templateIds: Object.keys(TEMPLATES),
    palettes: PALETTES.map((palette) => ({
      id: palette.id,
      name: palette.name,
      colors: [palette.primary, palette.accent, palette.surfaceAlt, palette.ink],
    })),
    fontPairs: FONT_PAIRS.map((pair) => ({ id: pair.id, name: pair.name })),
    trades: [...TRADES],
    sectionVariants: Object.fromEntries(
      Object.entries(listSectionVariants()).map(([kind, variants]) => [kind, [...variants]]),
    ),
  }
}
