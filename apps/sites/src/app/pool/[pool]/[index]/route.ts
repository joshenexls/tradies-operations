import { NextResponse } from 'next/server'

/**
 * Imagery per (pool, index) — one URL shape, two sources:
 *
 * - IMAGE_POOL_SOURCE=r2 (+ POOL_BASE_URL): 302 to curated licensed
 *   photography on R2 at `${POOL_BASE_URL}/${pool}/${index}.jpg` (uploaded by
 *   scripts/curate-pool.ts — see docs/deploy-cloudflare.md).
 * - default 'svg': deterministic, trade-tuned placeholder art. Not real
 *   photography, but composed to read as a professional editorial image
 *   (layered palette, soft light, grain, vignette) rather than a labelled
 *   gradient — so offline previews look presentable before the R2 pool lands.
 */

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deep base / mid / warm-or-cool accent, chosen to feel like the trade. */
type Palette = { base: string; mid: string; accent: string; light: string }

const PALETTES: Record<string, Palette> = {
  heritage: { base: '#241812', mid: '#6b4a2b', accent: '#c8944f', light: '#e8c79a' },
  modern: { base: '#0f1e2b', mid: '#2b5570', accent: '#63a6c9', light: '#bfe0f0' },
  bold: { base: '#17130f', mid: '#7a3b1e', accent: '#e0873a', light: '#f2c58f' },
  plumbing: { base: '#0a262a', mid: '#155962', accent: '#4fb3b8', light: '#b7e7e6' },
  roofing: { base: '#1f272c', mid: '#405663', accent: '#b5673f', light: '#e2b79c' },
  electrical: { base: '#161310', mid: '#5a4420', accent: '#e0b23a', light: '#f4dd97' },
}

function paletteFor(pool: string): Palette {
  const p = pool.toLowerCase()
  if (p.includes('heritage')) return PALETTES.heritage!
  if (p.includes('bold')) return PALETTES.bold!
  if (p.includes('plumb')) return PALETTES.plumbing!
  if (p.includes('roof')) return PALETTES.roofing!
  if (p.includes('electric')) return PALETTES.electrical!
  if (p.includes('modern')) return PALETTES.modern!
  return PALETTES.modern!
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

  const svg = placeholderSvg(pool, index)
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

/** Deterministic editorial placeholder — same (pool,index) → identical bytes. */
function placeholderSvg(pool: string, index: string): string {
  const pal = paletteFor(pool)
  const seed = hash(`${pool}:${index}`)
  // seeded, in-family variation so the 6 images of a pool differ but cohere
  const angle = 100 + (seed % 60) // 100–160deg gradient sweep
  const lightX = 20 + (seed % 45) // % — soft key light position
  const lightY = 18 + ((seed >> 3) % 40)
  const blobX = 30 + ((seed >> 5) % 55)
  const blobY = 55 + ((seed >> 7) % 35)
  const bandRot = -28 + ((seed >> 9) % 50)
  const gid = `g${seed.toString(36)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="${gid}bg" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0" stop-color="${pal.mid}"/>
      <stop offset="0.55" stop-color="${pal.base}"/>
      <stop offset="1" stop-color="${pal.base}"/>
    </linearGradient>
    <radialGradient id="${gid}key" cx="${lightX}%" cy="${lightY}%" r="70%">
      <stop offset="0" stop-color="${pal.light}" stop-opacity="0.42"/>
      <stop offset="0.45" stop-color="${pal.accent}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${pal.base}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${gid}vig" cx="50%" cy="46%" r="75%">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
    </radialGradient>
    <filter id="${gid}soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="70"/>
    </filter>
    <filter id="${gid}grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 100}" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
  </defs>

  <rect width="1600" height="1000" fill="url(#${gid}bg)"/>

  <!-- soft depth: two blurred accent masses -->
  <g filter="url(#${gid}soft)" opacity="0.9">
    <circle cx="${(blobX / 100) * 1600}" cy="${(blobY / 100) * 1000}" r="340" fill="${pal.accent}" opacity="0.28"/>
    <circle cx="${1600 - (blobX / 100) * 1200}" cy="${((100 - blobY) / 100) * 900}" r="240" fill="${pal.mid}" opacity="0.5"/>
  </g>

  <!-- structural diagonal band for composition -->
  <g transform="rotate(${bandRot} 800 500)" opacity="0.10">
    <rect x="-200" y="470" width="2000" height="150" fill="${pal.light}"/>
  </g>

  <!-- key light + vignette + grain -->
  <rect width="1600" height="1000" fill="url(#${gid}key)"/>
  <rect width="1600" height="1000" fill="url(#${gid}vig)"/>
  <rect width="1600" height="1000" filter="url(#${gid}grain)"/>
</svg>`
}
