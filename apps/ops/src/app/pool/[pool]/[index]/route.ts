import { NextResponse } from 'next/server'

/**
 * Copied from apps/sites so the library sample render is self-contained:
 * deterministic, offline SVG placeholders per (pool, index). Phase 4 replaces
 * this with curated licensed photography served from R2 — same URL shape.
 */

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pool: string; index: string }> },
) {
  const { pool, index } = await params
  const seed = hash(`${pool}:${index}`)
  const hue = seed % 360
  const hue2 = (hue + 40) % 360
  const label = pool.replaceAll('-', ' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 45% 38%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 55% 24%)"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#g)"/>
  <circle cx="${300 + (seed % 900)}" cy="${200 + (seed % 500)}" r="260" fill="hsl(${hue2} 60% 55% / 0.25)"/>
  <circle cx="${1100 - (seed % 400)}" cy="${700 - (seed % 300)}" r="180" fill="hsl(${hue} 60% 70% / 0.2)"/>
  <text x="800" y="520" text-anchor="middle" font-family="system-ui, sans-serif" font-size="44" fill="rgba(255,255,255,0.55)" letter-spacing="6">${label.toUpperCase()} ${index}</text>
</svg>`
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
