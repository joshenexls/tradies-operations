'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import type { Prospect } from '@tradies/db'
import {
  chatSessions,
  events,
  leads,
  permissionEvents,
  previewVisits,
  prospects,
  siteSpecs,
  sites,
  suppressionList,
} from '@tradies/db/schema'
import { normalizeEmail, normalizePhone, normalizePlaceId } from '@tradies/compliance'
import {
  EVENT_TYPES,
  GenerationFailedError,
  generateSiteVersion,
  resolveActivePreset,
  resolveCostRatesFromEnv,
  resolveGeneratorFromEnv,
} from '@tradies/engine'
import { tradeSchema, type BusinessFacts } from '@tradies/site-spec'
import { getDb } from '@/lib/db'

export type CreateProspectForm = {
  name: string
  trade: string
  town: string
  phone?: string
  email?: string
  /** Comma-separated lists, split server-side. */
  areas?: string
  services?: string
  styleKey?: string
}

export type CreateProspectResult = { ok: true; prospectId: string } | { error: string }

export async function createManualProspect(
  form: CreateProspectForm,
): Promise<CreateProspectResult> {
  const db = getDb()
  const name = form.name.trim()
  const town = form.town.trim()
  if (!name) return { error: 'Business name is required' }
  if (!town) return { error: 'Town is required' }
  const tradeResult = tradeSchema.safeParse(form.trade)
  if (!tradeResult.success) return { error: 'Pick a valid trade' }
  const trade = tradeResult.data

  // Operator-entered facts: everything below carries 'operator' provenance —
  // the generator can only use what is typed here (FACT-GUARD enforces it).
  const facts: BusinessFacts = {
    businessName: name,
    trade,
    town,
    phone: form.phone?.trim() ? { value: form.phone.trim(), source: 'operator' } : undefined,
    email: form.email?.trim() ? { value: form.email.trim(), source: 'operator' } : undefined,
    serviceAreas: splitList(form.areas).length > 0 ? splitList(form.areas) : [town],
    services: splitList(form.services).map((value) => ({ value, source: 'operator' as const })),
    accreditations: [],
    claims: [],
  }

  const styleKey = form.styleKey || 'modern'
  const resolved = await resolveActivePreset(db, styleKey, trade)
  if (!resolved) return { error: `No active design system for style "${styleKey}"` }

  const [prospect] = await db
    .insert(prospects)
    .values({
      businessName: name,
      city: town,
      trade,
      source: 'manual',
      status: 'in_review',
      segment: 'no_site',
      phone: form.phone?.trim() || null,
      extractedProfile: facts,
    })
    .returning()
  if (!prospect) return { error: 'Failed to create prospect' }

  try {
    await generateSiteVersion({
      db,
      generator: resolveGeneratorFromEnv(),
      prospectId: prospect.id,
      facts,
      preset: resolved.preset,
      stylePresetId: resolved.presetId,
      costRates: resolveCostRatesFromEnv(),
    })
  } catch (err) {
    if (err instanceof GenerationFailedError) {
      return { error: `Prospect created but generation failed: ${err.message}` }
    }
    throw err
  }
  revalidatePath('/pipeline')
  return { ok: true, prospectId: prospect.id }
}

export type SuppressResult = { ok: true } | { error: string }

export async function suppressProspect(prospectId: string): Promise<SuppressResult> {
  const db = getDb()
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
  if (!prospect) return { error: 'Prospect not found' }

  await insertSuppressions(db, prospect, 'manual')
  await db
    .update(prospects)
    .set({ status: 'suppressed', suppressedAt: new Date(), updatedAt: new Date() })
    .where(eq(prospects.id, prospectId))
  await db.insert(permissionEvents).values({
    prospectId,
    kind: 'unsubscribed',
    channel: 'manual',
    recordedBy: 'operator',
  })
  await db.insert(events).values({
    prospectId,
    actor: 'operator',
    type: EVENT_TYPES.prospectSuppressed,
    payload: { reason: 'manual' },
  })
  revalidatePath('/pipeline')
  revalidatePath(`/prospects/${prospectId}`)
  return { ok: true }
}

/**
 * GDPR erasure: suppression entries first (we must remember never to contact
 * them again — the suppression list stores normalized identifiers, which is
 * permitted for exactly this purpose), then strip PII everywhere else.
 */
export async function eraseProspect(prospectId: string): Promise<SuppressResult> {
  const db = getDb()
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
  if (!prospect) return { error: 'Prospect not found' }

  await insertSuppressions(db, prospect, 'erasure')
  await db.insert(permissionEvents).values({
    prospectId,
    kind: 'erasure_requested',
    channel: 'manual',
    recordedBy: 'operator',
  })

  await db
    .update(prospects)
    .set({
      businessName: '[erased]',
      phone: null,
      address: null,
      websiteUrl: null,
      extractedProfile: null,
      dataProvenance: null,
      status: 'suppressed',
      suppressedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, prospectId))

  const [site] = await db.select().from(sites).where(eq(sites.prospectId, prospectId)).limit(1)
  if (site) {
    await db.delete(leads).where(eq(leads.siteId, site.id))
    await db.delete(chatSessions).where(eq(chatSessions.siteId, site.id))
    await db.delete(previewVisits).where(eq(previewVisits.siteId, site.id))
    await db
      .update(sites)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(eq(sites.id, site.id))
  }
  // specs embed the full facts sheet (names, phones, quotes) — they must go
  await db.delete(siteSpecs).where(eq(siteSpecs.prospectId, prospectId))

  await db.insert(events).values({
    prospectId,
    actor: 'operator',
    type: EVENT_TYPES.erasureCompleted,
    payload: { erasedAt: new Date().toISOString() },
  })
  revalidatePath('/pipeline')
  revalidatePath(`/prospects/${prospectId}`)
  return { ok: true }
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

type Db = ReturnType<typeof getDb>

async function insertSuppressions(
  db: Db,
  prospect: Prospect,
  reason: 'manual' | 'erasure',
): Promise<void> {
  const email = prospect.extractedProfile?.email?.value
  const entries: { kind: 'email' | 'phone' | 'place_id'; value: string }[] = []
  if (email) entries.push({ kind: 'email', value: normalizeEmail(email) })
  if (prospect.phone) entries.push({ kind: 'phone', value: normalizePhone(prospect.phone) })
  if (prospect.placeId)
    entries.push({ kind: 'place_id', value: normalizePlaceId(prospect.placeId) })
  for (const entry of entries) {
    await db
      .insert(suppressionList)
      .values({ ...entry, reason, sourceChannel: 'ops', prospectId: prospect.id })
      .onConflictDoNothing()
  }
}
