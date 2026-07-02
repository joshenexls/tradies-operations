import { count, eq } from 'drizzle-orm'
import { inboxThreads } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { NavLinks } from './nav-links'

/**
 * Server shell for the nav: fetches the unread (needs_reply) inbox count so
 * the badge is live on every page load, then defers to the client component
 * for pathname-aware highlighting.
 */
export async function Nav() {
  let inboxCount = 0
  try {
    const [row] = await getDb()
      .select({ value: count() })
      .from(inboxThreads)
      .where(eq(inboxThreads.status, 'needs_reply'))
    inboxCount = row?.value ?? 0
  } catch {
    // the nav must never take the shell down (e.g. building without a DB)
  }
  return <NavLinks inboxCount={inboxCount} />
}
