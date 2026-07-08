import { eq } from 'drizzle-orm'
import { prospects, sites, type Db } from '@tradies/db'
import {
  generatePitch,
  prospectToFacts,
  resolveCostRatesFromEnv,
  type GeneratePitchResult,
} from '@tradies/engine'
import type { PitchGenerator } from '@tradies/llm'
import { resolvePitchGenerator } from '../lib/clients'

/**
 * Pipeline wrapper around the shared engine pitch path — same code the ops
 * regenerate button uses. Runs after render QA (the pitch links the preview,
 * so the site must exist) and before the review gate, so the operator always
 * reviews site and pitch together.
 */
export async function generatePitchStep(
  db: Db,
  input: { prospectId: string; feedback?: string; generator?: PitchGenerator },
): Promise<GeneratePitchResult> {
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1)
  if (!prospect) throw new Error(`unknown prospect ${input.prospectId}`)

  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.prospectId, input.prospectId))
    .limit(1)
  if (!site) {
    throw new Error(
      `prospect ${input.prospectId} has no site — generate the site before pitching it`,
    )
  }

  const pattern = process.env.PREVIEW_URL_PATTERN ?? 'http://{slug}.localhost:3000'
  const previewUrl = pattern.replaceAll('{slug}', site.slug)

  return await generatePitch({
    db,
    generator: input.generator ?? resolvePitchGenerator(),
    prospectId: prospect.id,
    facts: prospectToFacts(prospect),
    previewUrl,
    feedback: input.feedback,
    costRates: resolveCostRatesFromEnv(),
  })
}
