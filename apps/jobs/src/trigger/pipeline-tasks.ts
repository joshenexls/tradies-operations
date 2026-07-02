import { schedules, task, wait } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { reviewRequests } from '@tradies/db'
import type { Trade } from '@tradies/site-spec'
import { resolveClients, resolveStripe } from '../lib/clients'
import { getDb } from '../lib/db'
import { discoverCity } from '../pipeline/discover-city'
import { dispatchOutreach, reconcileOutreach } from '../pipeline/dispatch-outreach'
import { enrichProspect } from '../pipeline/enrich-prospect'
import { expirePreviews } from '../pipeline/expire-previews'
import { generatePitchStep } from '../pipeline/generate-pitch-step'
import { generateSiteSpecStep } from '../pipeline/generate-step'
import { reconcileSubscriptions } from '../pipeline/reconcile-subscriptions'
import { renderQa } from '../pipeline/render-qa'
import { requestReview } from '../pipeline/request-review'
import { scoreWebsite } from '../pipeline/score-website'

const previewUrl = (slug: string) =>
  (process.env.PREVIEW_URL_PATTERN ?? 'http://{slug}.localhost:3000').replace('{slug}', slug)

type ReviewDecision = {
  decision: 'approved' | 'regenerate' | 'rejected'
  feedback?: string
  stylePresetOverride?: string
}

export const discoverCityTask = task({
  id: 'discover_city',
  queue: { name: 'apify', concurrencyLimit: 1 },
  run: async (payload: {
    city: string
    trade: Trade
    maxPlaces?: number
    styleKey?: string
    batchLabel?: string
    autoApprove?: boolean
  }) => {
    const db = getDb()
    const clients = resolveClients()
    const result = await discoverCity(db, { apify: clients.apify }, payload)
    for (const prospectId of result.created) {
      await processProspectTask.trigger({
        prospectId,
        styleKey: payload.styleKey,
        batchLabel: payload.batchLabel ?? `Discovery ${payload.city} (${payload.trade})`,
        city: payload.city,
        autoApprove: payload.autoApprove ?? false,
      })
    }
    return result
  },
})

export const processProspectTask = task({
  id: 'process_prospect',
  queue: { name: 'pipeline', concurrencyLimit: 4 },
  run: async (payload: {
    prospectId: string
    styleKey?: string
    batchId?: string
    batchLabel?: string
    city?: string
    autoApprove: boolean
  }) => {
    const db = getDb()
    const clients = resolveClients()

    await enrichProspect(
      db,
      { firecrawl: clients.firecrawl, extractor: clients.extractor },
      { prospectId: payload.prospectId },
    )
    const scored = await scoreWebsite(
      db,
      { psi: clients.psi, judge: clients.judge },
      { prospectId: payload.prospectId },
    )
    if (scored.segment === 'fine') return { stopped: 'fine' as const }

    let feedback: string | undefined
    let stylePresetId: string | undefined
    // generate → QA → human gate; regenerate decisions loop back here
    for (let round = 0; round < 5; round++) {
      await generateSiteSpecStep(db, {
        prospectId: payload.prospectId,
        styleKey: payload.styleKey,
        stylePresetId,
        feedback,
      })
      await renderQa(db, { prospectId: payload.prospectId, previewUrl })
      // pitch before the review gate so the operator reviews site + pitch together
      await generatePitchStep(db, { prospectId: payload.prospectId, feedback })

      const token = await wait.createToken({ timeout: '72h' })
      const review = await requestReview(db, {
        prospectId: payload.prospectId,
        batchId: payload.batchId,
        batchLabel: payload.batchLabel,
        city: payload.city,
        autoApprove: payload.autoApprove,
        waitpointToken: token.id,
      })
      if (review.autoApproved) break

      const result = await wait.forToken<ReviewDecision>(token)
      if (!result.ok) {
        // token timed out — leave the request pending for the operator
        return { stopped: 'review_timeout' as const }
      }
      if (result.output.decision === 'approved') break
      if (result.output.decision === 'rejected') return { stopped: 'rejected' as const }
      feedback = result.output.feedback
      stylePresetId = result.output.stylePresetOverride
      await db
        .update(reviewRequests)
        .set({ status: 'pending', waitpointToken: null })
        .where(eq(reviewRequests.id, review.requestId))
    }

    return await dispatchOutreach(db, { prospectId: payload.prospectId })
  },
})

export const expirePreviewsTask = schedules.task({
  id: 'expire_previews',
  cron: '0 3 * * *',
  run: async () => expirePreviews(getDb()),
})

/** Safety net behind the webhooks: re-check non-terminal outreach daily. */
export const reconcileOutreachTask = schedules.task({
  id: 'reconcile_outreach',
  cron: '30 4 * * *',
  run: async () => reconcileOutreach(getDb()),
})

/** Safety net behind the Stripe webhooks: re-derive lapse/recovery daily. */
export const reconcileSubscriptionsTask = schedules.task({
  id: 'reconcile_subscriptions',
  cron: '0 5 * * *',
  run: async () => reconcileSubscriptions(getDb(), resolveStripe()),
})
