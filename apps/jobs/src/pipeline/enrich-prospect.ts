import { eq } from 'drizzle-orm'
import { events, prospectCosts, prospects, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'
import { extractedFactsSchema, toBusinessFactsPatch, verifyExtractedFacts } from '@tradies/llm'
import type { FactsExtractionClient, ScrapeClient } from './types'

/**
 * Firecrawl scrape → LLM extraction → evidence hard-check. Facts only enter
 * the warehouse when their quote appears verbatim in the scraped page — the
 * extraction-side analog of FACT-GUARD.
 */
export async function enrichProspect(
  db: Db,
  deps: { firecrawl: ScrapeClient; extractor: FactsExtractionClient },
  input: { prospectId: string },
): Promise<{ enriched: boolean; dropped?: number; skippedReason?: string }> {
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1)
  if (!prospect) throw new Error(`unknown prospect ${input.prospectId}`)
  if (!prospect.websiteUrl) {
    return { enriched: false, skippedReason: 'no_website' }
  }

  await db.update(prospects).set({ status: 'enriching' }).where(eq(prospects.id, prospect.id))
  const scraped = await deps.firecrawl.scrape(prospect.websiteUrl)
  const extraction = await deps.extractor.extractFacts({
    businessName: prospect.businessName ?? 'Unknown business',
    trade: prospect.trade ?? 'other',
    town: prospect.city ?? '',
    markdown: scraped.markdown,
  })

  const parsed = extractedFactsSchema.safeParse(extraction.candidate)
  if (!parsed.success) {
    await db.insert(events).values({
      prospectId: prospect.id,
      actor: 'system',
      type: EVENT_TYPES.prospectEnriched,
      payload: { ok: false, reason: 'extraction_schema_invalid' },
    })
    return { enriched: false, skippedReason: 'extraction_schema_invalid' }
  }

  const patch = toBusinessFactsPatch(parsed.data)
  const { kept, dropped } = verifyExtractedFacts(patch, scraped.markdown)

  const provenance = {
    ...(prospect.dataProvenance ?? {}),
    extractedProfile: {
      source: 'own_website',
      url: prospect.websiteUrl,
      model: extraction.model,
      droppedFacts: dropped.length,
      at: new Date().toISOString(),
    },
  }
  await db
    .update(prospects)
    .set({
      extractedProfile: { ...(prospect.extractedProfile ?? {}), ...kept },
      dataProvenance: provenance,
    })
    .where(eq(prospects.id, prospect.id))

  await db.insert(prospectCosts).values({
    prospectId: prospect.id,
    category: 'llm',
    provider: extraction.model,
    units: String(extraction.usage.inputTokens + extraction.usage.outputTokens),
    amountMicroGbp: Math.round(
      extraction.usage.inputTokens * Number(process.env.JUDGE_RATE_INPUT_MICROGBP ?? 0) +
        extraction.usage.outputTokens * Number(process.env.JUDGE_RATE_OUTPUT_MICROGBP ?? 0),
    ),
    ref: 'extract-facts-v1',
  })
  await db.insert(events).values({
    prospectId: prospect.id,
    actor: 'system',
    type: EVENT_TYPES.prospectEnriched,
    payload: { ok: true, kept: Object.keys(kept), dropped },
  })
  return { enriched: true, dropped: dropped.length }
}
