'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { events, prospects, reviewRequests } from '@tradies/db/schema'
import { EVENT_TYPES } from '@tradies/engine'
import { getDb } from '@/lib/db'
import { completeWaitpoint } from '../waitpoints'
import { generateForProspect } from './generation'

export type ReviewDecision = 'approved' | 'regenerate' | 'rejected'

export type DecideResult = { ok: true } | { error: string }

export async function decideReview(
  requestId: string,
  decision: ReviewDecision,
  opts: { notes?: string; feedback?: string; stylePresetOverride?: string } = {},
): Promise<DecideResult> {
  const db = getDb()
  const [request] = await db
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.id, requestId))
    .limit(1)
  if (!request) return { error: 'Review request not found' }
  if (request.status !== 'pending') return { error: 'Review request is already decided' }

  if (decision === 'regenerate') {
    if (!opts.feedback?.trim()) return { error: 'Feedback is required to regenerate' }
    // With a parked Trigger run, the JOBS pipeline owns regeneration — the
    // token completion below carries the feedback; generating here too would
    // double-generate. Only the tokenless (pure ops) path generates locally.
    if (!request.waitpointToken) {
      const result = await generateForProspect(request.prospectId, {
        feedback: opts.feedback.trim(),
        presetId: opts.stylePresetOverride,
      })
      if ('error' in result) return { error: result.error }
    }
    // the request stays pending — the operator re-reviews the new version
    await db
      .update(reviewRequests)
      .set({
        status: 'pending',
        notes: opts.feedback.trim(),
        stylePresetOverride: opts.stylePresetOverride ?? null,
        updatedAt: new Date(),
      })
      .where(eq(reviewRequests.id, requestId))
  } else {
    await db
      .update(reviewRequests)
      .set({
        status: decision,
        decidedBy: 'operator',
        decidedAt: new Date(),
        notes: opts.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(reviewRequests.id, requestId))
    await db
      .update(prospects)
      .set({ status: decision === 'approved' ? 'approved' : 'rejected', updatedAt: new Date() })
      .where(eq(prospects.id, request.prospectId))
  }

  await db.insert(events).values({
    prospectId: request.prospectId,
    actor: 'operator',
    type: EVENT_TYPES.reviewDecided,
    payload: {
      requestId,
      decision,
      notes: opts.notes ?? null,
      feedback: opts.feedback ?? null,
      stylePresetOverride: opts.stylePresetOverride ?? null,
    },
  })

  // Stage B: the jobs pipeline parks a Trigger.dev run on this token
  if (request.waitpointToken) {
    await completeWaitpoint(request.waitpointToken, {
      decision,
      feedback: opts.feedback ?? undefined,
      stylePresetOverride: opts.stylePresetOverride ?? undefined,
    })
  }

  revalidatePath('/review', 'layout')
  revalidatePath('/pipeline')
  revalidatePath(`/prospects/${request.prospectId}`)
  return { ok: true }
}
