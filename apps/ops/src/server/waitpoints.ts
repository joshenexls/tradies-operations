/**
 * Trigger.dev waitpoint completion. The jobs pipeline (apps/jobs) parks a run
 * on a wait token when it files a review request; decideReview calls this to
 * release it. Without TRIGGER_SECRET_KEY (pure Phase-2 local mode, no jobs
 * runtime) completion is skipped — decideReview has already persisted the
 * decision, so nothing is lost.
 */
export async function completeWaitpoint(token: string, payload: unknown): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn(
      `[waitpoints] TRIGGER_SECRET_KEY unset — waitpoint ${token} not completed (decision persisted in DB)`,
    )
    return
  }
  const { wait } = await import('@trigger.dev/sdk')
  await wait.completeToken(token, payload)
}
