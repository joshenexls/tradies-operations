import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import type { Db } from '@tradies/db'
import { chatSessions, leads, prospects, sites } from '@tradies/db/schema'
import { createTestDb } from '@tradies/db/test-harness'
import { getFixture } from '@tradies/fixtures'
import { CHAT_DEMO_PREAMBLE } from '@tradies/llm'
import { ChatRateLimiter } from './chat'

/**
 * The chatbot endpoint end to end against the fixture responder: grounded
 * replies, session persistence with usage, lead capture into the same table
 * the form feeds, and the rate limit. lib/db resolves its client at module
 * load, so the test PGlite must be on globalThis BEFORE the route import.
 */
const db = await createTestDb()
globalThis.__tradiesDb = db as unknown as Db
const { POST } = await import('@/app/api/chat/route')

const fixture = getFixture('leeds-plumber-swift')

async function seedSite(slug: string, overrides: { noindex?: boolean } = {}) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      businessName: fixture.businessName,
      city: fixture.town,
      trade: fixture.trade,
      source: 'manual',
      status: 'in_review',
      extractedProfile: fixture.facts,
    })
    .returning()
  const [site] = await db
    .insert(sites)
    .values({
      prospectId: prospect!.id,
      slug,
      status: 'preview',
      noindex: overrides.noindex ?? true,
    })
    .returning()
  return site!
}

function call(body: unknown) {
  return POST(
    new NextRequest('http://chat-test.localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

const chatGlobal = globalThis as { __tradiesChatLimiter?: ChatRateLimiter }

describe('POST /api/chat', () => {
  it('answers from the facts sheet, labels demo, and persists the session', async () => {
    chatGlobal.__tradiesChatLimiter = new ChatRateLimiter({
      perSession: 100,
      perSite: 1000,
      windowMs: 60_000,
    })
    const site = await seedSite('chat-grounded')
    const service = fixture.facts.services[0]!.value

    const response = await call({
      siteId: site.id,
      sessionId: 'session-grounded-1',
      messages: [{ role: 'user', content: `Do you do ${service.toLowerCase()}?` }],
    })
    expect(response.status).toBe(200)
    const { reply } = (await response.json()) as { reply: string }
    // grounded: names the business and the asked-about service; demo-labelled
    expect(reply).toContain(CHAT_DEMO_PREAMBLE)
    expect(reply).toContain(fixture.businessName)
    expect(reply.toLowerCase()).toContain(service.toLowerCase())

    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.siteId, site.id))
    expect(session).toBeDefined()
    expect(session!.isDemo).toBe(true)
    expect(session!.visitorId).toBe('session-grounded-1')
    const transcript = session!.messages as { role: string; content: string }[]
    expect(transcript[transcript.length - 1]).toEqual({ role: 'assistant', content: reply })
  })

  it('captures a lead when the visitor shares contact details', async () => {
    chatGlobal.__tradiesChatLimiter = new ChatRateLimiter({
      perSession: 100,
      perSite: 1000,
      windowMs: 60_000,
    })
    const site = await seedSite('chat-lead')

    const response = await call({
      siteId: site.id,
      sessionId: 'session-lead-1',
      messages: [
        { role: 'user', content: 'My name is Sarah Wilson, call me back on 0113 496 0000 please' },
      ],
    })
    expect(response.status).toBe(200)

    const [lead] = await db.select().from(leads).where(eq(leads.siteId, site.id))
    expect(lead).toBeDefined()
    expect(lead!.source).toBe('chatbot')
    expect(lead!.phone).toContain('0113')
    expect(lead!.name).toBe('Sarah Wilson')
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.siteId, site.id))
    expect(lead!.chatSessionId).toBe(session!.id)
  })

  it('rate limits with 429 once the per-session budget is spent', async () => {
    chatGlobal.__tradiesChatLimiter = new ChatRateLimiter({
      perSession: 1,
      perSite: 1000,
      windowMs: 60_000,
    })
    const site = await seedSite('chat-limited')
    const body = {
      siteId: site.id,
      sessionId: 'session-limited-1',
      messages: [{ role: 'user', content: 'Hello' }],
    }
    expect((await call(body)).status).toBe(200)
    expect((await call(body)).status).toBe(429)
  })

  it('rejects malformed bodies and unknown sites', async () => {
    chatGlobal.__tradiesChatLimiter = new ChatRateLimiter({
      perSession: 100,
      perSite: 1000,
      windowMs: 60_000,
    })
    expect((await call({ nope: true })).status).toBe(400)
    expect(
      (
        await call({
          siteId: '00000000-0000-4000-8000-000000000000',
          sessionId: 'session-unknown-1',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).status,
    ).toBe(404)
  })
})

describe('ChatRateLimiter', () => {
  it('windows reset and a rejected request burns no quota', () => {
    let now = 1_000
    const limiter = new ChatRateLimiter({ perSession: 2, perSite: 3, windowMs: 100 }, () => now)
    const key = { siteId: 'site-a', sessionId: 's1', ip: null }
    expect(limiter.allow(key)).toBe(true)
    expect(limiter.allow(key)).toBe(true)
    expect(limiter.allow(key)).toBe(false)
    now += 101 // window rolls over
    expect(limiter.allow(key)).toBe(true)
    // per-site cap spans sessions
    expect(limiter.allow({ siteId: 'site-a', sessionId: 's2', ip: null })).toBe(true)
    expect(limiter.allow({ siteId: 'site-a', sessionId: 's3', ip: null })).toBe(true)
    expect(limiter.allow({ siteId: 'site-a', sessionId: 's4', ip: null })).toBe(false)
  })
})
