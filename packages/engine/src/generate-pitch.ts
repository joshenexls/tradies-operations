import { desc, eq } from 'drizzle-orm'
import { events, pitches, type Db, type PitchRow } from '@tradies/db'
import { pitchSchema, type PitchGenerator } from '@tradies/llm'
import { validateStringsAgainstFacts, type BusinessFacts } from '@tradies/site-spec'
import { recordLlmCost, type LlmCostRates } from './costs'
import { EVENT_TYPES } from './events'
import { buildRepairFeedback } from './repair-loop'

const PROMPT_VERSION = 'pitch-v1'

export class PitchGenerationFailedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastProblems: string,
  ) {
    super(`pitch generation failed after ${attempts} attempts:\n${lastProblems}`)
    this.name = 'PitchGenerationFailedError'
  }
}

export type GeneratePitchResult = {
  pitch: PitchRow
  attempts: number
}

/**
 * THE pitch path — the jobs pipeline and the ops regenerate button both go
 * through here so validation and persistence can never diverge: generator →
 * zod (subject/body limits) → FACT-GUARD over subject and body → repair loop
 * (≤ maxAttempts) → pitches v(n) + pitch_generated event + per-attempt cost
 * rows. The stored body has NO legal footer — dispatch appends it at queue
 * time so footer content is always current.
 */
export async function generatePitch(input: {
  db: Db
  generator: PitchGenerator
  prospectId: string
  facts: BusinessFacts
  previewUrl: string
  feedback?: string
  maxAttempts?: number
  costRates?: LlmCostRates
}): Promise<GeneratePitchResult> {
  const { db, generator, prospectId, facts, previewUrl, maxAttempts = 3 } = input

  let feedback = input.feedback
  let lastProblems = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await generator.generatePitch({ facts, previewUrl, feedback })
    if (input.costRates) {
      await recordLlmCost(db, {
        prospectId,
        usage: result.usage,
        rates: input.costRates,
        provider: result.model,
        ref: `${PROMPT_VERSION}#${attempt}`,
      })
    }

    const parsed = pitchSchema.safeParse(result.candidate)
    if (!parsed.success) {
      lastProblems = buildRepairFeedback({
        originalFeedback: input.feedback,
        zodError: parsed.error,
      })
      feedback = lastProblems
      continue
    }

    // FACT-GUARD: a pitch may only claim what the evidenced facts sheet backs
    const violations = validateStringsAgainstFacts(
      [
        { path: 'pitch.body', text: parsed.data.body },
        { path: 'pitch.subject', text: parsed.data.subject },
      ],
      facts,
    )
    if (violations.length > 0) {
      lastProblems = buildRepairFeedback({
        originalFeedback: input.feedback,
        factViolations: violations,
      })
      feedback = lastProblems
      continue
    }

    const [latest] = await db
      .select({ version: pitches.version })
      .from(pitches)
      .where(eq(pitches.prospectId, prospectId))
      .orderBy(desc(pitches.version))
      .limit(1)
    const version = (latest?.version ?? 0) + 1

    const [pitch] = await db
      .insert(pitches)
      .values({
        prospectId,
        version,
        subject: parsed.data.subject,
        body: parsed.data.body,
        previewUrl,
        model: result.model,
        promptVersion: PROMPT_VERSION,
      })
      .returning()
    if (!pitch) throw new Error('failed to insert pitch row')

    await db.insert(events).values({
      prospectId,
      actor: 'system',
      type: EVENT_TYPES.pitchGenerated,
      payload: {
        version,
        attempts: attempt,
        model: result.model,
        promptVersion: PROMPT_VERSION,
        feedback: input.feedback ?? null,
      },
    })

    return { pitch, attempts: attempt }
  }

  await db.insert(events).values({
    prospectId,
    actor: 'system',
    type: EVENT_TYPES.generationFailed,
    payload: { kind: 'pitch', attempts: maxAttempts, problems: lastProblems },
  })
  throw new PitchGenerationFailedError(maxAttempts, lastProblems)
}
