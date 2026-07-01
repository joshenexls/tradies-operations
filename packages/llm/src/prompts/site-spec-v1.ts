import type { BusinessFacts, presetConstraints } from '@tradies/site-spec'

export type PresetConstraints = ReturnType<typeof presetConstraints>

export type SiteSpecPromptInput = {
  facts: BusinessFacts
  /** Result of presetConstraints(preset) — never the raw preset. */
  constraints: PresetConstraints
  feedback?: string
}

export type SiteSpecPrompt = {
  system: string
  user: string
  version: 'site-spec-v1'
}

/**
 * The prompt is persuasion only — the hard guarantees live in siteSpecSchema,
 * FACT-GUARD and validateSpecAgainstPreset, which run on every candidate.
 */
export function buildSiteSpecPrompt(input: SiteSpecPromptInput): SiteSpecPrompt {
  const { facts, constraints, feedback } = input

  const system = [
    'You write website specs for UK tradespeople. You must respond by calling the emit_site_spec tool exactly once with JSON that matches its schema — no prose.',
    '',
    'Non-negotiable rules:',
    '- State only facts present in the facts sheet. Never invent services, service areas, history, qualifications or contact details.',
    '- Never write reviews, testimonials, star ratings, quotes from customers, or any review-like language. Social proof is handled elsewhere.',
    '- Claims such as insurance, guarantees, certifications or awards may appear only when the facts sheet contains a matching claim or accreditation.',
    `- Badges and accreditations: only these evidenced ids may appear: ${facts.accreditations.length > 0 ? facts.accreditations.map((a) => a.id).join(', ') : '(none — omit all badges and the trust section)'}.`,
    `- Service areas: only ${[...new Set([facts.town, ...facts.serviceAreas])].join(', ')}.`,
    '',
    'Design constraints (violations are rejected automatically):',
    `- templateId must be "${constraints.templateId}".`,
    `- theme.paletteId must be "${constraints.paletteId}" and theme.fontPairId must be "${constraints.fontPairId}" (radius "${constraints.radius}").`,
    `- Imagery must reference pool "${constraints.imageryPool}" with index 0-5.`,
    '- Allowed section variants:',
    ...Object.entries(constraints.allowedVariants).map(
      ([kind, variants]) => `  - ${kind}: ${variants.join(', ')}`,
    ),
    constraints.preferredSections
      ? `- Preferred section order: ${constraints.preferredSections.join(', ')} (hero first, contact last).`
      : '- Sections: hero first, contact last, no repeated kinds.',
    '',
    `Write all copy in UK English with a ${constraints.tone} tone.`,
  ].join('\n')

  const user = [
    'Facts sheet (the only permitted source of factual claims):',
    JSON.stringify(facts, null, 2),
    '',
    'Generate the complete site spec now.',
    ...(feedback ? ['', 'Operator feedback on the previous attempt — address it:', feedback] : []),
  ].join('\n')

  return { system, user, version: 'site-spec-v1' }
}
