import { z } from 'zod'

/**
 * Phase-aware env parsing. Every app declares the env it needs with the build
 * phase that introduces each key, so a missing key fails fast with a message
 * telling the founder exactly what to provision (plan §7) instead of a stack
 * trace from deep inside an adapter.
 */
export type EnvSpec = Record<
  string,
  {
    schema: z.ZodType<string | undefined>
    /** Build phase that introduces this key (1–7), for the error message. */
    phase: number
    /** Where to get it, e.g. "Supabase project settings". */
    hint?: string
  }
>

export class MissingEnvError extends Error {
  constructor(public readonly missing: { key: string; phase: number; hint?: string }[]) {
    const lines = missing.map(
      (m) => `  - ${m.key} (needed from Phase ${m.phase}${m.hint ? `; ${m.hint}` : ''})`,
    )
    super(`Missing or invalid environment variables:\n${lines.join('\n')}`)
    this.name = 'MissingEnvError'
  }
}

export function parseEnv<S extends EnvSpec>(
  spec: S,
  source: Record<string, string | undefined> = process.env,
): { [K in keyof S]: z.output<S[K]['schema']> } {
  const out: Record<string, unknown> = {}
  const missing: { key: string; phase: number; hint?: string }[] = []
  for (const [key, entry] of Object.entries(spec)) {
    const result = entry.schema.safeParse(source[key])
    if (result.success) {
      out[key] = result.data
    } else {
      missing.push({ key, phase: entry.phase, hint: entry.hint })
    }
  }
  if (missing.length > 0) throw new MissingEnvError(missing)
  return out as { [K in keyof S]: z.output<S[K]['schema']> }
}

/** Required non-empty string. */
export const required = z.string().min(1)
/** Optional string; absent is fine (feature stays disabled). */
export const optional = z.string().min(1).optional()
