import { allProspectFixtures } from '@tradies/fixtures'
import type { CostRecorder, FetchLike } from './types'
import { NotFoundError } from './types'

export interface PsiClient {
  score(url: string): Promise<{ performance: number; https: boolean }>
}

/** Returns the fixture's canned PageSpeed result; unknown urls raise NotFoundError. */
export class FixturePsiClient implements PsiClient {
  constructor(private readonly options: { recordCost?: CostRecorder } = {}) {}

  async score(url: string): Promise<{ performance: number; https: boolean }> {
    const fixture = allProspectFixtures.find((f) => f.websiteUrl === url && f.psi !== null)
    if (!fixture?.psi) {
      throw new NotFoundError(`No fixture PSI result for url: ${url}`)
    }
    this.options.recordCost?.({
      category: 'psi',
      provider: 'pagespeed-fixture',
      units: 1,
      amountMicroGbp: 0, // PSI API is free within quota
      ref: url,
    })
    return { ...fixture.psi }
  }
}

/** Raised when the PageSpeed API errors or omits the performance category. */
export class PsiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'PsiError'
  }
}

export type RealPsiClientOptions = {
  /** Optional — PSI is free-tier keyless at low volume. */
  apiKey?: string
  /** Injectable for tests — adapter tests must never hit the network. */
  fetchImpl?: FetchLike
  recordCost?: CostRecorder
}

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export class RealPsiClient implements PsiClient {
  private readonly fetchImpl: FetchLike

  constructor(private readonly options: RealPsiClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async score(url: string): Promise<{ performance: number; https: boolean }> {
    const params = new URLSearchParams({ url, category: 'performance', strategy: 'mobile' })
    if (this.options.apiKey) params.set('key', this.options.apiKey)
    const response = await this.fetchImpl(`${PSI_ENDPOINT}?${params.toString()}`)
    if (!response.ok) {
      throw new PsiError(`PageSpeed request failed (HTTP ${response.status})`, response.status)
    }
    const body = (await response.json()) as {
      lighthouseResult?: {
        finalUrl?: string
        requestedUrl?: string
        categories?: { performance?: { score?: number } }
      }
    }
    const score = body.lighthouseResult?.categories?.performance?.score
    if (typeof score !== 'number') {
      throw new PsiError('PageSpeed response missing lighthouse performance category')
    }
    const finalUrl = body.lighthouseResult?.finalUrl ?? body.lighthouseResult?.requestedUrl ?? url
    this.options.recordCost?.({
      category: 'psi',
      provider: 'pagespeed',
      units: 1,
      amountMicroGbp: 0, // free within quota
      ref: url,
    })
    return { performance: Math.round(score * 100), https: finalUrl.startsWith('https:') }
  }
}
