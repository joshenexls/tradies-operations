/**
 * Self-host the web fonts used by generated sites so live customer pages no
 * longer hot-link Google Fonts (a UK-GDPR / third-party-request / perf concern).
 *
 * Network is required — this downloads the woff2 files from fonts.gstatic.com.
 * Node's built-in fetch only honours HTTPS_PROXY when NODE_USE_ENV_PROXY=1
 * (Node >= 22.21), so behind the agent proxy run:
 *
 *   NODE_USE_ENV_PROXY=1 pnpm --filter @tradies/sites exec tsx ../../scripts/fetch-fonts.ts
 *
 * or, from the repo root with tsx + workspace resolution on PATH:
 *
 *   pnpm fetch:fonts
 *
 * It derives the finite { family, weights[] } set from FONT_PAIRS, asks Google
 * for each family's css2 stylesheet with a desktop-Chrome User-Agent (so Google
 * emits woff2 rather than ttf), downloads the `latin` subset file per weight
 * (falling back to `latin-ext`) into apps/sites/public/fonts/, and writes a
 * same-origin fonts.css covering every pair. Idempotent (overwrites) with
 * deterministic ordering so re-runs produce a stable diff.
 */
import { FONT_PAIRS } from '@tradies/site-spec'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Modern desktop Chrome so Google returns woff2 (older/absent UAs get ttf).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Body copy needs a normal weight; headings need their pair weight. Always
// fetch 400 + 600 + the pair's headingWeight per family to be safe (Google
// silently drops any weight a family does not ship, e.g. Lato has no 600).
const BASE_WEIGHTS = [400, 600]

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(HERE, '../apps/sites/public/fonts')

type Face = {
  family: string
  weight: number
  style: string
  subset: string
  url: string
}

/** family (Google display name) -> sorted unique weights we want. */
function wantedFamilies(): Map<string, number[]> {
  const acc = new Map<string, Set<number>>()
  for (const pair of FONT_PAIRS) {
    for (const family of [pair.heading, pair.body]) {
      const set = acc.get(family) ?? new Set<number>()
      for (const w of BASE_WEIGHTS) set.add(w)
      set.add(pair.headingWeight)
      acc.set(family, set)
    }
  }
  return new Map(
    [...acc.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, weights]) => [family, [...weights].sort((a, b) => a - b)]),
  )
}

function slug(family: string): string {
  return family.toLowerCase().replaceAll(' ', '-')
}

function cssUrl(family: string, weights: number[]): string {
  const fam = family.replaceAll(' ', '+')
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`
}

/** Split a Google css2 response into its subset-commented @font-face blocks. */
function parseFaces(css: string): Face[] {
  const faces: Face[] = []
  const re = /\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    const subset = m[1].trim()
    const block = m[2]
    const family = block.match(/font-family:\s*'([^']+)'/)?.[1]
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1]
    const style = block.match(/font-style:\s*(\w+)/)?.[1]
    const url = block.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/)?.[1]
    if (family && weight && style && url) {
      faces.push({ family, weight: Number(weight), style, subset, url })
    }
  }
  return faces
}

/** Prefer the latin subset, then latin-ext, for a normal-style weight. */
function pickFace(faces: Face[], weight: number): Face | undefined {
  const normal = faces.filter((f) => f.style === 'normal' && f.weight === weight)
  return (
    normal.find((f) => f.subset === 'latin') ??
    normal.find((f) => f.subset === 'latin-ext') ??
    normal[0]
  )
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}\n${await res.text()}`)
  }
  return res.text()
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  return new Uint8Array(await res.arrayBuffer())
}

type Written = { family: string; weight: number; file: string; bytes: number }

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  const families = wantedFamilies()
  const written: Written[] = []
  const missing: string[] = []

  for (const [family, weights] of families) {
    const css = await fetchText(cssUrl(family, weights))
    const faces = parseFaces(css)
    for (const weight of weights) {
      const face = pickFace(faces, weight)
      if (!face) {
        missing.push(`${family} ${weight}`)
        continue
      }
      const file = `${slug(family)}-${weight}.woff2`
      const bytes = await fetchBytes(face.url)
      await writeFile(path.join(OUT_DIR, file), bytes)
      written.push({ family, weight, file, bytes: bytes.byteLength })
    }
  }

  // Deterministic: families already sorted, weights ascending within family.
  const faceBlocks = written.map(
    (w) =>
      `@font-face {\n` +
      `  font-family: '${w.family}';\n` +
      `  font-style: normal;\n` +
      `  font-weight: ${w.weight};\n` +
      `  font-display: swap;\n` +
      `  src: url('/fonts/${w.file}') format('woff2');\n` +
      `}`,
  )
  const css =
    `/* Generated by scripts/fetch-fonts.ts — do not edit by hand. */\n` +
    `/* Self-hosted Google Fonts (latin subset) for every FONT_PAIRS family. */\n\n` +
    faceBlocks.join('\n\n') +
    '\n'
  await writeFile(path.join(OUT_DIR, 'fonts.css'), css)

  const totalBytes = written.reduce((n, w) => n + w.bytes, 0)
  console.log(`\nSelf-hosted fonts written to ${OUT_DIR}`)
  console.log(`  families: ${families.size}`)
  console.log(`  woff2 files: ${written.length}`)
  console.log(`  total: ${(totalBytes / 1024).toFixed(1)} KiB (${totalBytes} bytes)`)
  console.log(`  fonts.css: ${faceBlocks.length} @font-face rules`)
  for (const [family, weights] of families) {
    const got = written.filter((w) => w.family === family).map((w) => w.weight)
    console.log(`    ${family}: requested [${weights.join(', ')}] -> got [${got.join(', ')}]`)
  }
  if (missing.length) {
    console.log(`  note: not shipped by Google, skipped: ${missing.join(', ')}`)
  }
}

main().catch((e) => {
  console.error('fetch-fonts failed:', e)
  process.exitCode = 1
})
