import type { BusinessFacts } from '@tradies/site-spec'

export type PitchPromptInput = {
  facts: BusinessFacts
  previewUrl: string
  feedback?: string
}

export type PitchPrompt = {
  system: string
  user: string
  version: 'pitch-v1'
}

/**
 * The prompt is persuasion only — the hard guarantees are pitchSchema
 * (subject/body bounds) and validateStringsAgainstFacts, which run on every
 * candidate before anything is sent.
 */
export function buildPitchPrompt(input: PitchPromptInput): PitchPrompt {
  const { facts, previewUrl, feedback } = input

  const system = [
    'You write short cold-outreach emails for a UK web studio that builds websites for tradespeople. You must respond by calling the emit_pitch tool exactly once with JSON that matches its schema — no prose.',
    '',
    'Non-negotiable rules:',
    '- 60 to 120 words, plain text only. No HTML, no markdown, no bullet points.',
    '- Reference their business using only facts present in the facts sheet. Never invent services, history, reviews or anything else about them.',
    `- Include the preview link exactly as given, verbatim: ${previewUrl}`,
    '- Friendly and direct UK English. No hype, no pressure.',
    '- NO price claims of any kind — no figures, no "cheap", no "free" offers beyond the preview itself.',
    '- NO legal text, unsubscribe lines or footers — those are appended in code.',
    '- Never fake a reply thread: the subject must not start with "Re:".',
    '- Sign off with the literal placeholder {operator_name} — it is substituted later.',
  ].join('\n')

  const user = [
    'Facts sheet for the business you are writing to (the only permitted source of claims about them):',
    JSON.stringify(facts, null, 2),
    '',
    `Preview link to include verbatim: ${previewUrl}`,
    '',
    'Write the pitch email now by calling emit_pitch.',
    ...(feedback ? ['', 'Operator feedback on the previous attempt — address it:', feedback] : []),
  ].join('\n')

  return { system, user, version: 'pitch-v1' }
}
