'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { sites } from '@tradies/db/schema'
import { disableSite, publishSite, unpublishSite } from '@tradies/engine'
import { getDb } from '@/lib/db'

/**
 * Ops-desk overrides on the go-live state machine — thin wrappers around the
 * engine's site-lifecycle functions (the same ones the Stripe webhook calls)
 * with actor 'operator', so a manual publish is indistinguishable in the
 * events log from a paid one except for the actor.
 */

export type LifecycleActionResult = { ok: true } | { error: string }

async function runLifecycle(
  siteId: string,
  transition: (db: ReturnType<typeof getDb>) => Promise<void>,
): Promise<LifecycleActionResult> {
  const db = getDb()
  const [site] = await db
    .select({ prospectId: sites.prospectId })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1)
  if (!site) return { error: 'Site not found' }
  try {
    await transition(db)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  revalidatePath(`/prospects/${site.prospectId}`)
  revalidatePath('/customers')
  return { ok: true }
}

export async function publishSiteAction(
  siteId: string,
  reason?: string,
): Promise<LifecycleActionResult> {
  return runLifecycle(siteId, (db) => publishSite(db, { siteId, actor: 'operator', reason }))
}

export async function unpublishSiteAction(
  siteId: string,
  reason?: string,
): Promise<LifecycleActionResult> {
  return runLifecycle(siteId, (db) => unpublishSite(db, { siteId, actor: 'operator', reason }))
}

export async function disableSiteAction(
  siteId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return runLifecycle(siteId, (db) => disableSite(db, { siteId, actor: 'operator', reason }))
}
