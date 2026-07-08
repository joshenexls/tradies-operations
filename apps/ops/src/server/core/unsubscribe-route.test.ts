import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import type { Db } from '@tradies/db'
import { permissionEvents, prospects, suppressionList } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { buildUnsubscribeToken, resolveUnsubscribeSecret } from '@tradies/integrations'

/**
 * The public one-click unsubscribe endpoint, end to end: a signed token
 * suppresses every identifier we hold; a forged one changes nothing.
 *
 * lib/db resolves its client once at module load, so the test PGlite must be
 * installed on globalThis BEFORE the route module is imported.
 */
const db = await createTestDb()
globalThis.__tradiesDb = db as unknown as Db
const { GET } = await import('@/app/u/[token]/route')

const call = (token: string) =>
  GET(new NextRequest(`http://ops.localhost/u/${token}`), {
    params: Promise.resolve({ token }),
  })

describe('GET /u/[token]', () => {
  it('suppresses email, domain, phone and place id and confirms in plain HTML', async () => {
    const [prospect] = await db
      .insert(prospects)
      .values({
        placeId: 'ChIJunsub-test',
        businessName: 'Swift Flow Plumbing',
        phone: '+44 113 496 0721',
        status: 'contacted',
        extractedProfile: {
          email: { value: 'Info@SwiftFlowPlumbing.example', source: 'own_website' },
        },
      })
      .returning()
    const token = buildUnsubscribeToken(prospect!.id, resolveUnsubscribeSecret())

    const response = await call(token)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain("You've been unsubscribed")

    const entries = await db.select().from(suppressionList)
    const byKind = Object.fromEntries(entries.map((e) => [e.kind, e.value]))
    expect(byKind).toEqual({
      email: 'info@swiftflowplumbing.example',
      domain: 'swiftflowplumbing.example',
      phone: '01134960721',
      place_id: 'ChIJunsub-test',
    })

    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect!.id))
    expect(after?.status).toBe('suppressed')
    expect(after?.suppressedAt).toBeInstanceOf(Date)

    const permissions = await db
      .select()
      .from(permissionEvents)
      .where(eq(permissionEvents.prospectId, prospect!.id))
    expect(permissions.map((p) => p.kind)).toContain('unsubscribed')

    // idempotent: a second click confirms again without duplicating events
    const again = await call(token)
    expect(again.status).toBe(200)
    expect(
      await db.select().from(permissionEvents).where(eq(permissionEvents.prospectId, prospect!.id)),
    ).toHaveLength(1)
  })

  it('rejects invalid and forged tokens with 400 and touches nothing', async () => {
    const [prospect] = await db
      .insert(prospects)
      .values({ placeId: 'ChIJunsub-forged', businessName: 'Target Ltd', status: 'contacted' })
      .returning()

    expect((await call('not-a-token')).status).toBe(400)
    const forged = `${Buffer.from(prospect!.id).toString('base64url')}.${Buffer.from(
      'bad-signature',
    ).toString('base64url')}`
    expect((await call(forged)).status).toBe(400)

    expect(
      await db.select().from(suppressionList).where(eq(suppressionList.prospectId, prospect!.id)),
    ).toHaveLength(0)
    const [after] = await db.select().from(prospects).where(eq(prospects.id, prospect!.id))
    expect(after?.status).toBe('contacted')
  })
})
