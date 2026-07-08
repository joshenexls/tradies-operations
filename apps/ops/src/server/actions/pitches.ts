'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { prospects, sites } from '@tradies/db/schema'
import {
  PitchGenerationFailedError,
  generatePitch,
  prospectToFacts,
  resolveCostRatesFromEnv,
} from '@tradies/engine'
import { AnthropicPitchGenerator, FixturePitchGenerator, type PitchGenerator } from '@tradies/llm'
import { getDb } from '@/lib/db'
import { previewUrl } from '@/lib/preview-url'

/** PITCH_GENERATOR=fixture (default) keeps the desk offline; =anthropic needs a key. */
function resolvePitchGeneratorFromEnv(env: NodeJS.ProcessEnv = process.env): PitchGenerator {
  const mode = env.PITCH_GENERATOR ?? 'fixture'
  if (mode === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('PITCH_GENERATOR=anthropic requires ANTHROPIC_API_KEY')
    return new AnthropicPitchGenerator({ apiKey })
  }
  if (mode !== 'fixture') {
    throw new Error(`Unknown PITCH_GENERATOR "${mode}" (fixture | anthropic)`)
  }
  return new FixturePitchGenerator()
}

export type RegeneratePitchResult = { ok: true; version: number } | { error: string }

/** Generate (or regenerate, with optional operator feedback) the pitch for a prospect. */
export async function regeneratePitch(
  prospectId: string,
  opts: { feedback?: string } = {},
): Promise<RegeneratePitchResult> {
  const db = getDb()
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
  if (!prospect) return { error: 'Prospect not found' }
  const [site] = await db.select().from(sites).where(eq(sites.prospectId, prospectId)).limit(1)
  if (!site) return { error: 'No site yet — generate the site before pitching it' }

  try {
    const result = await generatePitch({
      db,
      generator: resolvePitchGeneratorFromEnv(),
      prospectId,
      facts: prospectToFacts(prospect),
      previewUrl: previewUrl(site.slug),
      feedback: opts.feedback?.trim() || undefined,
      costRates: resolveCostRatesFromEnv(),
    })
    revalidatePath('/review', 'layout')
    revalidatePath(`/prospects/${prospectId}`)
    return { ok: true, version: result.pitch.version }
  } catch (err) {
    // a failed repair loop is an expected operational outcome, not a crash
    if (err instanceof PitchGenerationFailedError) return { error: err.message }
    throw err
  }
}
