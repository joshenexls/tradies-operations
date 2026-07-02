import { prospectCosts, type Db } from '@tradies/db'
import type { TokenUsage } from '@tradies/llm'

export type LlmCostRates = {
  /** micro-GBP per input token */
  inputMicroGbp: number
  /** micro-GBP per output token */
  outputMicroGbp: number
}

/** Fixture generation is free; real rates come from env (plan §Stage A env). */
export function resolveCostRatesFromEnv(env: NodeJS.ProcessEnv = process.env): LlmCostRates {
  return {
    inputMicroGbp: Number(env.LLM_RATE_INPUT_MICROGBP ?? 0),
    outputMicroGbp: Number(env.LLM_RATE_OUTPUT_MICROGBP ?? 0),
  }
}

export async function recordLlmCost(
  db: Db,
  input: {
    prospectId: string
    usage: TokenUsage
    rates: LlmCostRates
    provider: string
    ref?: string
  },
): Promise<void> {
  const amount = Math.round(
    input.usage.inputTokens * input.rates.inputMicroGbp +
      input.usage.outputTokens * input.rates.outputMicroGbp,
  )
  await db.insert(prospectCosts).values({
    prospectId: input.prospectId,
    category: 'llm',
    provider: input.provider,
    units: String(input.usage.inputTokens + input.usage.outputTokens),
    amountMicroGbp: amount,
    ref: input.ref ?? null,
  })
}
