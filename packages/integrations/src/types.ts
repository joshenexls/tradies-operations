export type CostCategory = 'llm' | 'firecrawl' | 'places' | 'psi' | 'email' | 'postcard' | 'other'

export type CostEntry = {
  category: CostCategory
  provider: string
  units: number
  /** Cost in millionths of a pound so ledgers never touch floats. */
  amountMicroGbp: number
  ref?: string
}

/** Sink for per-call cost accounting; adapters call it once per billable request. */
export type CostRecorder = (entry: CostEntry) => void

/** Thrown by fixture adapters when a url has no fixture behind it. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * Minimal fetch surface the real adapters depend on. Tests inject a stub;
 * production uses the global fetch. NO adapter test may hit the network.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>
