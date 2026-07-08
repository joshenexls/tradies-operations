import type { TokenUsage } from './generator'

/**
 * Observation seam around each generation attempt — the future Langfuse (or
 * any tracing) adapter implements this; everything else uses the no-op.
 */
export interface GenerationObserver {
  onAttempt(meta: { promptVersion: string; attempt: number; feedback?: string }): void
  onResult(meta: { usage: TokenUsage; ok: boolean; problems?: string }): void
}

export const noopObserver: GenerationObserver = {
  onAttempt() {},
  onResult() {},
}
