import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { customers, events, prospects, sites, type Db } from '@tradies/db'
import { EVENT_TYPES } from '@tradies/engine'

/**
 * The claim flow's testable core. A claim token identifies exactly one site;
 * the page renders one of four states and only 'claimable' can start a
 * checkout. Nothing here talks to Stripe — the route composes this with the
 * StripeClient so the core stays pure db-in/db-out.
 */

export type ClaimContext =
  | { state: 'unknown' }
  | { state: 'expired' }
  | { state: 'already-claimed' }
  | {
      state: 'claimable'
      site: typeof sites.$inferSelect
      prospect: typeof prospects.$inferSelect
    }

export async function loadClaimContext(db: Db, claimToken: string): Promise<ClaimContext> {
  const [site] = await db.select().from(sites).where(eq(sites.claimToken, claimToken)).limit(1)
  if (!site) return { state: 'unknown' }
  // stale specs need operator eyes before resurrecting — no checkout on expired
  if (site.status === 'expired' || site.status === 'disabled') return { state: 'expired' }
  if (site.status === 'claimed' || site.status === 'live') return { state: 'already-claimed' }
  const [existingCustomer] = await db
    .select({ id: customers.id, status: customers.status })
    .from(customers)
    .where(eq(customers.siteId, site.id))
    .limit(1)
  if (existingCustomer && existingCustomer.status === 'active') return { state: 'already-claimed' }
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, site.prospectId))
    .limit(1)
  if (!prospect) return { state: 'unknown' }
  return { state: 'claimable', site, prospect }
}

export const claimFormSchema = z.object({
  businessName: z.string().min(1).max(120),
  contactName: z.string().max(120).optional(),
  email: z.string().email().max(254),
  phone: z.string().max(32).optional(),
  serviceAreas: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  tosAccepted: z.literal(true),
})
export type ClaimForm = z.infer<typeof claimFormSchema>

export type StartClaimResult =
  | { ok: true; customerId: string; siteId: string; slug: string; prospectId: string }
  | { error: string }

/**
 * Records intent-to-buy BEFORE the Stripe redirect: customer row in
 * 'pending_checkout' (idempotent — retrying checkout updates it), prospect →
 * 'claimed', audit event. The site row stays 'preview' until money lands.
 */
export async function startClaim(
  db: Db,
  input: { claimToken: string; form: unknown; now?: Date },
): Promise<StartClaimResult> {
  const context = await loadClaimContext(db, input.claimToken)
  if (context.state !== 'claimable') {
    return { error: `this preview cannot be claimed (${context.state})` }
  }
  const parsed = claimFormSchema.safeParse(input.form)
  if (!parsed.success) {
    return { error: 'please check the form — a valid email and accepted terms are required' }
  }
  const { site, prospect } = context
  const now = input.now ?? new Date()
  const intake = { ...parsed.data, tosAcceptedAt: now.toISOString() }

  const [customer] = await db
    .insert(customers)
    .values({
      prospectId: prospect.id,
      siteId: site.id,
      email: parsed.data.email,
      intake,
      status: 'pending_checkout',
    })
    .onConflictDoUpdate({
      target: customers.siteId,
      set: { email: parsed.data.email, intake, status: 'pending_checkout', updatedAt: now },
    })
    .returning()
  if (!customer) return { error: 'failed to record the claim' }

  await db
    .update(prospects)
    .set({ status: 'claimed', updatedAt: now })
    .where(eq(prospects.id, prospect.id))
  await db.insert(events).values({
    prospectId: prospect.id,
    siteId: site.id,
    actor: 'system',
    type: EVENT_TYPES.claimStarted,
    payload: { slug: site.slug, email: parsed.data.email },
  })

  return {
    ok: true,
    customerId: customer.id,
    siteId: site.id,
    slug: site.slug,
    prospectId: prospect.id,
  }
}
