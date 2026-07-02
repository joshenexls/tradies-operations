import { desc, eq } from 'drizzle-orm'
import type { CustomerRow, Db, SiteRow, SubscriptionRow } from '@tradies/db'
import { customers, prospects, sites, subscriptions } from '@tradies/db/schema'

/**
 * Customers screen data: every customer with their site, prospect business
 * name and LATEST subscription (Stripe can leave several rows behind after a
 * cancel + re-subscribe). Pure db-in/rows-out so vitest covers the join; the
 * page under src/app/customers renders the result.
 */

export type CustomerListRow = {
  customer: CustomerRow
  subscription: SubscriptionRow | null
  site: SiteRow
  businessName: string | null
}

export async function listCustomers(db: Db): Promise<CustomerListRow[]> {
  const rows = await db
    .select({
      customer: customers,
      subscription: subscriptions,
      site: sites,
      businessName: prospects.businessName,
    })
    .from(customers)
    .innerJoin(sites, eq(customers.siteId, sites.id))
    .innerJoin(prospects, eq(customers.prospectId, prospects.id))
    .leftJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .orderBy(desc(customers.createdAt), desc(subscriptions.createdAt))

  // the left join fans out one row per subscription — keep only the newest
  const byCustomer = new Map<string, CustomerListRow>()
  for (const row of rows) {
    if (!byCustomer.has(row.customer.id)) byCustomer.set(row.customer.id, row)
  }
  return [...byCustomer.values()]
}

export type CustomerStats = { activeCount: number; mrrPence: number }

/** Subscription statuses that count as paying for the MRR headline. */
const ACTIVE_STATUSES = new Set(['active', 'trialing'])

/**
 * Pure stats over listCustomers rows. `priceMonthlyPence` is passed in (the
 * page reads PRICE_MONTHLY_PENCE, default 1999) so tests stay env-free.
 */
export function customerStats(rows: CustomerListRow[], priceMonthlyPence: number): CustomerStats {
  const activeCount = rows.filter(
    (row) => row.subscription?.status != null && ACTIVE_STATUSES.has(row.subscription.status),
  ).length
  return { activeCount, mrrPence: activeCount * priceMonthlyPence }
}
