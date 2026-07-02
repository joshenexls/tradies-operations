'use server'

import { revalidatePath } from 'next/cache'
import { resolveTemplateIngestorFromEnv } from '@tradies/engine'
import { TRADES, type StylePreset, type Trade } from '@tradies/site-spec'
import { getDb } from '@/lib/db'
import {
  activateTemplate as activateTemplateCore,
  ingestTemplate,
  reingestTemplate as reingestTemplateCore,
  retireTemplate as retireTemplateCore,
  type IngestTemplateResult,
  type ReingestTemplateResult,
  type TemplateActionResult,
} from '../core/templates'

/** Serializable form payload from the upload page. '' trade means generic. */
export type UploadTemplateForm = {
  name: string
  rawHtml: string
  componentsHtml: string
  styleKey: string
  trade: string
  imageryPool: string
  tone: string
}

const TONES: readonly StylePreset['tone'][] = ['friendly', 'professional', 'premium', 'no-nonsense']

function invalid(message: string): IngestTemplateResult {
  return {
    ok: false,
    code: 'ingest-failed',
    message,
    problems: [],
    sanitizationReport: null,
    attempts: 0,
  }
}

export async function uploadTemplate(form: UploadTemplateForm): Promise<IngestTemplateResult> {
  const name = form.name.trim()
  const styleKey = form.styleKey.trim()
  const rawHtml = form.rawHtml
  const componentsHtml = form.componentsHtml.trim()
  const imageryPool = form.imageryPool.trim()

  if (name.length < 2 || name.length > 60) return invalid('Name must be 2–60 characters')
  if (!/^[a-z0-9-]{2,32}$/.test(styleKey)) {
    return invalid('Style key must be a 2–32 char lowercase slug (a-z, 0-9, -)')
  }
  if (rawHtml.trim().length === 0) return invalid('Paste or choose the lander HTML first')
  if (form.trade !== '' && !TRADES.includes(form.trade as Trade)) {
    return invalid(`Unknown trade "${form.trade}"`)
  }
  if (imageryPool.length < 2 || imageryPool.length > 64) {
    return invalid('Imagery pool must be 2–64 characters')
  }
  const tone = TONES.find((t) => t === form.tone)
  if (!tone) return invalid(`Unknown tone "${form.tone}"`)

  const result = await ingestTemplate({
    db: getDb(),
    ingestor: resolveTemplateIngestorFromEnv(),
    input: {
      name,
      rawHtml,
      componentsHtml: componentsHtml.length > 0 ? componentsHtml : undefined,
      styleKey,
      trade: form.trade === '' ? null : (form.trade as Trade),
      imageryPool,
      tone,
      createdBy: 'operator',
    },
  })
  if (result.ok) revalidatePath('/library')
  return result
}

export async function activateTemplate(templateId: string): Promise<TemplateActionResult> {
  const result = await activateTemplateCore(getDb(), templateId)
  if ('ok' in result) refresh(templateId)
  return result
}

export async function retireTemplate(templateId: string): Promise<TemplateActionResult> {
  const result = await retireTemplateCore(getDb(), templateId)
  if ('ok' in result) refresh(templateId)
  return result
}

export async function reingestTemplate(templateId: string): Promise<ReingestTemplateResult> {
  const result = await reingestTemplateCore({
    db: getDb(),
    ingestor: resolveTemplateIngestorFromEnv(),
    templateId,
  })
  refresh(templateId) // a failed re-ingest still records onto the row
  return result
}

function refresh(templateId: string): void {
  revalidatePath('/library')
  revalidatePath(`/library/templates/${templateId}`)
}
