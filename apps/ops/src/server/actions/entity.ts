'use server'

import { revalidatePath } from 'next/cache'
import type { EntityType } from '@tradies/compliance'
import { getDb } from '@/lib/db'
import { classifyEntityCore } from '../core/entity'

export type ActionResult = { ok: true } | { error: string }

export async function classifyEntity(
  prospectId: string,
  entityType: EntityType,
  note?: string,
  companiesHouseNumber?: string,
): Promise<ActionResult> {
  try {
    await classifyEntityCore(getDb(), { prospectId, entityType, note, companiesHouseNumber })
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  revalidatePath('/pipeline')
  revalidatePath(`/prospects/${prospectId}`)
  revalidatePath('/review', 'layout')
  return { ok: true }
}
