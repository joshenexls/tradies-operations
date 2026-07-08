import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { customers, events, prospects, sites } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { loadClaimContext, startClaim } from './claim'

const db = await createTestDb()

let seq = 0
async function seedSite(status: 'preview' | 'expired' | 'live' | 'claimed' | 'disabled') {
  seq += 1
  const [prospect] = await db
    .insert(prospects)
    .values({ businessName: `Claim Test ${seq} Ltd`, status: 'contacted' })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug: `claim-test-${seq}`,
      status,
      claimToken: `claim-token-${seq}`,
    })
    .returning()
  return { prospect: prospect!, site: site! }
}

const validForm = {
  businessName: 'Claim Test Ltd',
  email: 'owner@claimtest.example',
  tosAccepted: true as const,
}

describe('loadClaimContext', () => {
  it('maps token/site states to the four page states', async () => {
    expect((await loadClaimContext(db, 'nope')).state).toBe('unknown')
    const { site: expired } = await seedSite('expired')
    expect((await loadClaimContext(db, expired.claimToken!)).state).toBe('expired')
    const { site: live } = await seedSite('live')
    expect((await loadClaimContext(db, live.claimToken!)).state).toBe('already-claimed')
    const { site: preview } = await seedSite('preview')
    expect((await loadClaimContext(db, preview.claimToken!)).state).toBe('claimable')
  })
})

describe('startClaim', () => {
  it('records intent: pending_checkout customer + claimed prospect + event, site stays preview', async () => {
    const { prospect, site } = await seedSite('preview')
    const result = await startClaim(db, { claimToken: site.claimToken!, form: validForm })
    expect(result).toMatchObject({ ok: true, siteId: site.id })

    const [customer] = await db.select().from(customers).where(eq(customers.siteId, site.id))
    expect(customer!.status).toBe('pending_checkout')
    expect(customer!.email).toBe(validForm.email)
    expect((customer!.intake as { tosAcceptedAt?: string }).tosAcceptedAt).toBeTruthy()

    const [afterProspect] = await db.select().from(prospects).where(eq(prospects.id, prospect.id))
    expect(afterProspect!.status).toBe('claimed')
    const [afterSite] = await db.select().from(sites).where(eq(sites.id, site.id))
    expect(afterSite!.status).toBe('preview') // money hasn't landed

    const rows = await db.select().from(events).where(eq(events.siteId, site.id))
    expect(rows.map((e) => e.type)).toContain('claim_started')
  })

  it('is retry-safe: a second attempt updates the same customer row', async () => {
    const { site } = await seedSite('preview')
    await startClaim(db, { claimToken: site.claimToken!, form: validForm })
    const second = await startClaim(db, {
      claimToken: site.claimToken!,
      form: { ...validForm, email: 'second@claimtest.example' },
    })
    expect(second).toMatchObject({ ok: true })
    const rows = await db.select().from(customers).where(eq(customers.siteId, site.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('second@claimtest.example')
  })

  it('rejects invalid forms and unclaimable states without writing anything', async () => {
    const { site } = await seedSite('preview')
    const bad = await startClaim(db, {
      claimToken: site.claimToken!,
      form: { ...validForm, tosAccepted: false },
    })
    expect('error' in bad).toBe(true)
    expect(await db.select().from(customers).where(eq(customers.siteId, site.id))).toHaveLength(0)

    const { site: expired } = await seedSite('expired')
    const nope = await startClaim(db, { claimToken: expired.claimToken!, form: validForm })
    expect('error' in nope).toBe(true)
  })
})
