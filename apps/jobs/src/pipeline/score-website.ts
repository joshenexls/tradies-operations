import { eq } from 'drizzle-orm'
import { events, prospects, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'
import type { PsiScorer, ScreenshotJudge } from './types'

/**
 * Composite website-health score: 40% PSI performance, 20% HTTPS, 40% vision
 * judge (weights renormalise when the judge can't run). `fine` sites leave
 * the pipeline — we only pitch businesses we can genuinely improve.
 */
export async function scoreWebsite(
  db: Db,
  deps: { psi: PsiScorer; judge?: ScreenshotJudge; screenshotBase64?: string },
  input: { prospectId: string; fineThreshold?: number },
): Promise<{ score: number | null; segment: 'no_site' | 'bad_site' | 'fine' }> {
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1)
  if (!prospect) throw new Error(`unknown prospect ${input.prospectId}`)

  if (!prospect.websiteUrl) {
    await db
      .update(prospects)
      .set({ segment: 'no_site', status: 'scored', websiteHealthScore: null })
      .where(eq(prospects.id, prospect.id))
    return { score: null, segment: 'no_site' }
  }

  const psi = await deps.psi.score(prospect.websiteUrl)
  const httpsScore = psi.https ? 100 : 0

  let verdict: { score: number; issues: string[] } | undefined
  if (deps.judge && deps.screenshotBase64) {
    verdict = await deps.judge.judge({
      imageBase64: deps.screenshotBase64,
      mediaType: 'image/png',
      context: `${prospect.trade ?? 'trade'} business website, ${prospect.city ?? 'UK'}`,
    })
  }

  const score = verdict
    ? Math.round(psi.performance * 0.4 + httpsScore * 0.2 + verdict.score * 0.4)
    : Math.round(psi.performance * 0.67 + httpsScore * 0.33)
  const threshold = input.fineThreshold ?? 70
  const segment = score >= threshold ? 'fine' : 'bad_site'

  await db
    .update(prospects)
    .set({ websiteHealthScore: score, segment, status: 'scored' })
    .where(eq(prospects.id, prospect.id))
  await db.insert(events).values({
    prospectId: prospect.id,
    actor: 'system',
    type: EVENT_TYPES.websiteScored,
    payload: { score, segment, psi, judge: verdict ?? null },
  })
  return { score, segment }
}
