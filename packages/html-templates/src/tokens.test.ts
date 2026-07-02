import { describe, expect, it } from 'vitest'
import { extractDesignTokens } from './tokens'
import { MINI_LANDER } from './test-fixtures'

describe('extractDesignTokens', () => {
  it('extracts hex colors ordered by frequency and font families in order', () => {
    const html = `<html><head><style>
      body { color: #111111; background: #FFFFFF; font-family: 'Inter', Arial, sans-serif; }
      .a { color: #111111; border-color: #abc; }
      h1 { color: #111111; font-family: "Fraunces", Georgia, serif !important; }
    </style></head><body>
      <p style="color:#ffffff;font-family:Inter, system-ui, sans-serif">x</p>
    </body></html>`
    const tokens = extractDesignTokens(html)
    expect(tokens.palette).toEqual(['#111111', '#ffffff', '#abc'])
    expect(tokens.fonts).toEqual(['Inter', 'Arial', 'Fraunces', 'Georgia'])
  })

  it('caps palette at 12 and fonts at 6', () => {
    const colors = Array.from(
      { length: 15 },
      (_, i) => `.c${i}{color:#0000${i.toString(16).padStart(2, '0')}}`,
    )
    const fonts = Array.from({ length: 9 }, (_, i) => `.f${i}{font-family:'Font ${i}', sans-serif}`)
    const html = `<style>${colors.join('')}${fonts.join('')}</style>`
    const tokens = extractDesignTokens(html)
    expect(tokens.palette).toHaveLength(12)
    expect(tokens.fonts).toHaveLength(6)
    expect(tokens.fonts[0]).toBe('Font 0')
  })

  it('reads the mini-lander tokens', () => {
    const tokens = extractDesignTokens(MINI_LANDER)
    expect(tokens.palette[0]).toBe('#ffffff') // used three times
    expect(tokens.palette).toContain('#0ea5e9')
    expect(tokens.fonts).toEqual(['Inter', 'Arial', 'Fraunces', 'Georgia'])
  })
})
