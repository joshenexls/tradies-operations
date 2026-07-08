import { load } from 'cheerio'

/**
 * Design-token extraction from an uploaded lander: the dominant hex palette
 * and the declared font families, for the operator UI and imagery matching.
 */

export type DesignTokens = { palette: string[]; fonts: string[] }

const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi

const GENERIC_FONT_KEYWORDS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  '-apple-system',
  'blinkmacsystemfont',
])

export function extractDesignTokens(html: string): DesignTokens {
  const $ = load(html)
  const chunks: string[] = []
  $('style').each((_, node) => {
    chunks.push($(node).text())
  })
  $('[style]').each((_, node) => {
    chunks.push($(node).attr('style') ?? '')
  })
  const css = chunks.join('\n')

  // palette: dedupe (case-insensitive), order by frequency (stable ties), cap 12
  const counts = new Map<string, number>()
  for (const match of css.matchAll(HEX_COLOR)) {
    const hex = match[0].toLowerCase()
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  const palette = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex]) => hex)

  // fonts: split stacks, strip quotes and generic fallback keywords, dedupe, cap 6
  const fonts: string[] = []
  const seen = new Set<string>()
  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = part
        .replace(/!important/gi, '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '')
        .trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (GENERIC_FONT_KEYWORDS.has(key) || seen.has(key)) continue
      seen.add(key)
      if (fonts.length < 6) fonts.push(name)
    }
  }

  return { palette, fonts }
}
