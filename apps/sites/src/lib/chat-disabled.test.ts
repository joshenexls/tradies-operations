import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import type { Db } from '@tradies/db'
import { prospects, sites } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { getFixture } from '@tradies/fixtures'
import { ChatRateLimiter } from './chat'

/**
 * The portal's chatbot kill switch at the API: a site with chatbotEnabled off
 * answers 404 exactly like an unknown site would. lib/db resolves its client
 * at module load, so the test PGlite must be on globalThis BEFORE the route
 * import (same pattern as chat-route.test.ts).
 */
const db = await createTestDb()
globalThis.__tradiesDb = db as unknown as Db
const { POST } = await import('@/app/api/chat/route')

const fixture = getFixture('leeds-plumber-swift')

async function seedSite(slug: string, chatbotEnabled: boolean) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      businessName: fixture.businessName,
      city: fixture.town,
      trade: fixture.trade,
      source: 'manual',
      status: 'converted',
      extractedProfile: fixture.facts,
    })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({ prospectId: prospect!.id, slug, status: 'live', noindex: false, chatbotEnabled })
    .returning()
  return site!
}

function call(siteId: string) {
  return POST(
    new NextRequest('http://chat-disabled-test.localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId,
        sessionId: 'session-disabled-1',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    }),
  )
}

const chatGlobal = globalThis as { __tradiesChatLimiter?: ChatRateLimiter }

describe('POST /api/chat with the chatbot toggled off', () => {
  it('returns 404 chat disabled, while an enabled site still answers', async () => {
    chatGlobal.__tradiesChatLimiter = new ChatRateLimiter({
      perSession: 100,
      perSite: 1000,
      windowMs: 60_000,
    })
    const disabled = await seedSite('chat-toggle-off', false)
    const response = await call(disabled.id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'chat disabled' })

    const enabled = await seedSite('chat-toggle-on', true)
    expect((await call(enabled.id)).status).toBe(200)
  })
})
