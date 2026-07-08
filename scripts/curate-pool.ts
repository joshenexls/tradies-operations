/**
 * Curates the licensed imagery pools from Pexels (manual, run on deploy day —
 * never part of any automated task; the repo stays fully offline without it).
 *
 *   PEXELS_API_KEY=... pnpm --filter @tradies/sites exec tsx ../../scripts/curate-pool.ts
 *
 * For each pool in pool-manifest.json it searches Pexels (landscape, original
 * width >= 1600px), downloads `count` photos via Pexels' server-side crop
 * (landscape crop re-sized to 1600x1000 with URL params — no local resize
 * dependency) and writes:
 *
 *   pool-out/{pool}/{index}.jpg
 *   pool-out/{pool}/attribution.json   (photographer credits — keep with the bucket)
 *
 * Upload to R2 afterwards with the loop documented in docs/deploy-cloudflare.md.
 * Pexels license: free for commercial use, no attribution required — we store
 * attribution anyway for provenance.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TARGET_WIDTH = 1600
const TARGET_HEIGHT = 1000
const PER_PAGE = 30

interface PoolSpec {
  queries: string[]
  count: number
}

interface Manifest {
  pools: Record<string, PoolSpec>
}

interface PexelsPhoto {
  id: number
  width: number
  height: number
  url: string
  alt: string | null
  photographer: string
  photographer_url: string
  src: { landscape: string }
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[]
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.dirname(scriptDir)
const outRoot = path.join(repoRoot, 'pool-out')

const apiKey = process.env.PEXELS_API_KEY
if (!apiKey) {
  console.error('\n✗ PEXELS_API_KEY is required (free key: https://www.pexels.com/api/)\n')
  process.exit(1)
}

async function searchPexels(query: string): Promise<PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', 'landscape')
  url.searchParams.set('per_page', String(PER_PAGE))
  const res = await fetch(url, { headers: { Authorization: apiKey! } })
  if (!res.ok) {
    throw new Error(`Pexels search failed for "${query}": ${res.status} ${await res.text()}`)
  }
  const body = (await res.json()) as PexelsSearchResponse
  return body.photos
}

/** Pexels' landscape crop URL, re-parameterised to our exact 1600x1000 frame. */
function cropUrl(photo: PexelsPhoto): string {
  const url = new URL(photo.src.landscape)
  url.searchParams.set('w', String(TARGET_WIDTH))
  url.searchParams.set('h', String(TARGET_HEIGHT))
  url.searchParams.set('fit', 'crop')
  return url.toString()
}

async function downloadJpeg(url: string, filePath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`)
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()))
}

async function curatePool(pool: string, spec: PoolSpec): Promise<void> {
  const dir = path.join(outRoot, pool)
  await mkdir(dir, { recursive: true })

  // Round-robin the queries so each pool mixes subjects; dedupe by photo id.
  const perQuery = await Promise.all(spec.queries.map((q) => searchPexels(q)))
  const seen = new Set<number>()
  const picked: { photo: PexelsPhoto; query: string }[] = []
  let exhausted = false
  while (picked.length < spec.count && !exhausted) {
    exhausted = true
    for (const [queryIndex, candidates] of perQuery.entries()) {
      if (picked.length >= spec.count) break
      const photo = candidates.shift()
      if (!photo) continue
      exhausted = false
      if (seen.has(photo.id) || photo.width < TARGET_WIDTH) continue
      seen.add(photo.id)
      picked.push({ photo, query: spec.queries[queryIndex]! })
    }
  }
  if (picked.length < spec.count) {
    throw new Error(
      `pool "${pool}": only ${picked.length}/${spec.count} photos >= ${TARGET_WIDTH}px — broaden the queries in pool-manifest.json`,
    )
  }

  const attribution = []
  for (const [index, { photo, query }] of picked.entries()) {
    const file = path.join(dir, `${index}.jpg`)
    await downloadJpeg(cropUrl(photo), file)
    attribution.push({
      index,
      file: `${index}.jpg`,
      query,
      pexelsId: photo.id,
      pexelsUrl: photo.url,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      alt: photo.alt ?? null,
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
    })
    console.log(`  ${pool}/${index}.jpg  ← ${photo.photographer} (pexels #${photo.id})`)
  }
  await writeFile(path.join(dir, 'attribution.json'), `${JSON.stringify(attribution, null, 2)}\n`)
}

async function main() {
  const manifestPath = path.join(scriptDir, 'pool-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest
  const pools = Object.entries(manifest.pools)
  console.log(`Curating ${pools.length} pools into ${outRoot}\n`)
  for (const [pool, spec] of pools) {
    console.log(`${pool} (${spec.count} images):`)
    await curatePool(pool, spec)
  }
  console.log('\n✓ Done. Review the images, then upload per docs/deploy-cloudflare.md §Imagery.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
