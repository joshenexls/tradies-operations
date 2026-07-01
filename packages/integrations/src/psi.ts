import { allProspectFixtures } from '@tradies/fixtures'
import type { CostRecorder } from './types'
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
