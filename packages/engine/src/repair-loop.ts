import type { ZodError } from 'zod'
import type { Violation } from '@tradies/site-spec'

/**
 * Turn validator output into corrective feedback for the next generation
 * attempt. Kept terse and imperative — the generator treats it like operator
 * feedback.
 */
export function buildRepairFeedback(input: {
  originalFeedback?: string
  zodError?: ZodError
  factViolations?: Violation[]
  presetViolations?: string[]
}): string {
  const lines: string[] = []
  if (input.originalFeedback) lines.push(input.originalFeedback)
  lines.push(
    'Your previous attempt was rejected. Fix exactly these problems and change nothing else:',
  )
  if (input.zodError) {
    for (const issue of input.zodError.issues.slice(0, 12)) {
      lines.push(`- schema: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
    }
  }
  for (const violation of input.factViolations ?? []) {
    lines.push(
      `- facts: ${violation.path} — ${violation.message}${violation.snippet ? ` (offending text: "${violation.snippet}")` : ''}`,
    )
  }
  for (const violation of input.presetViolations ?? []) {
    lines.push(`- design system: ${violation}`)
  }
  return lines.join('\n')
}
