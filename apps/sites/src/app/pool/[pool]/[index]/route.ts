import { NextResponse } from 'next/server'

/**
 * Imagery per (pool, index) — one URL shape, two sources:
 *
 * - IMAGE_POOL_SOURCE=r2 (+ POOL_BASE_URL): 302 to curated licensed
 *   photography on R2 at `${POOL_BASE_URL}/${pool}/${index}.jpg` (uploaded by
 *   scripts/curate-pool.ts — see docs/deploy-cloudflare.md).
 * - default 'svg': deterministic, offline SVG placeholders (byte-identical to
 *   Phase 1, so specs and visual baselines survive the swap).
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

  const poolBaseUrl = process.env.POOL_BASE_URL
  if (process.env.IMAGE_POOL_SOURCE === 'r2' && poolBaseUrl) {
    return NextResponse.redirect(`${poolBaseUrl.replace(/\/+$/, '')}/${pool}/${index}.jpg`, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=86400' },
    })
  }

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
