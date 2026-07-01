import { desc } from 'drizzle-orm'
import { sites } from '@tradies/db/schema'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Root-host page: operator convenience index of generated previews (dev). */
export default async function Home() {
  let rows: { slug: string; status: string; createdAt: Date }[] = []
  try {
    const db = getDb()
    rows = await db
      .select({ slug: sites.slug, status: sites.status, createdAt: sites.createdAt })
      .from(sites)
      .orderBy(desc(sites.createdAt))
      .limit(100)
  } catch {
    // empty database is fine on first run
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-sans">
      <h1 className="text-2xl font-bold">Generated previews</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Each site is served on its own subdomain. Generate one with{' '}
        <code className="rounded bg-neutral-100 px-1">
          pnpm gen --name "..." --trade plumber --town Leeds
        </code>
      </p>
      <ul className="mt-8 space-y-2">
        {rows.length === 0 && <li className="text-neutral-400">No sites yet.</li>}
        {rows.map((row) => (
          <li
            key={row.slug}
            className="flex items-center justify-between rounded border border-neutral-200 px-4 py-2"
          >
            <a
              className="font-medium text-blue-700 underline"
              href={`http://${row.slug}.localhost:3000`}
            >
              {row.slug}
            </a>
            <span className="text-xs uppercase tracking-wide text-neutral-500">{row.status}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
