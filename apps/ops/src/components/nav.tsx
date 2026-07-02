import { count, eq } from 'drizzle-orm'
import { editRequests, inboxThreads } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { NavLinks } from './nav-links'

/**
 * Server shell for the nav: fetches the unread (needs_reply) inbox count and
 * the new edit-request count so the badges are live on every page load, then
 * defers to the client component for pathname-aware highlighting.
 */
export async function Nav() {
  let inboxCount = 0
  let editsCount = 0
  try {
    const db = getDb()
    const [inboxRow] = await db
      .select({ value: count() })
      .from(inboxThreads)
      .where(eq(inboxThreads.status, 'needs_reply'))
    inboxCount = inboxRow?.value ?? 0
    const [editsRow] = await db
      .select({ value: count() })
      .from(editRequests)
      .where(eq(editRequests.status, 'new'))
    editsCount = editsRow?.value ?? 0
  } catch {
    // the nav must never take the shell down (e.g. building without a DB)
  }
  return <NavLinks inboxCount={inboxCount} editsCount={editsCount} />
}
