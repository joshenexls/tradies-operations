import { expect } from 'vitest'
import type { ComplianceErrorCode } from './errors'
import { ComplianceError } from './errors'

export const NOW = new Date('2026-07-01T00:00:00Z')

export const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

export function expectComplianceError(fn: () => void, code: ComplianceErrorCode): void {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(ComplianceError)
  expect((caught as ComplianceError).code).toBe(code)
}
