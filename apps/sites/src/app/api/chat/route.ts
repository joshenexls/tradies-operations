import { and, eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { chatSessions, leads, prospects, sites } from '@tradies/db/schema'
import { prospectToFacts } from '@tradies/engine'
import type { ChatMessage } from '@tradies/llm'
import { getDb } from '@/lib/db'
import { getChatRateLimiter, resolveChatResponder } from '@/lib/chat'
import { scheduleLeadAlert } from '@/lib/lead-alerts'
import { resolveMailer } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  siteId: z.string().uuid(),
  sessionId: z.string().min(8).max(64),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(30),
})

/**
 * The site chatbot endpoint. Answers come ONLY from the prospect's evidenced
 * facts sheet (the responder's system prompt carries nothing else); captured
 * contact details land in the same leads table the form feeds, tagged
 * 'chatbot'. Previews (noindex) always run in demo mode.
 */
export async function POST(request: NextRequest) {
  let parsed
  try {
    parsed = bodySchema.safeParse(await request.json())
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  const { siteId, sessionId, messages } = parsed.data

  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  if (!getChatRateLimiter().allow({ siteId, sessionId, ip })) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  }

  const db = getDb()
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)
  if (!site || site.status === 'expired' || site.status === 'disabled') {
    return NextResponse.json({ error: 'unknown site' }, { status: 404 })
  }
  // the customer's portal toggle — a disabled widget answers nobody
  if (!site.chatbotEnabled) {
    return NextResponse.json({ error: 'chat disabled' }, { status: 404 })
  }
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, site.prospectId))
    .limit(1)
  if (!prospect) return NextResponse.json({ error: 'unknown site' }, { status: 404 })

  const facts = prospectToFacts(prospect)
  const demo = site.noindex

  const result = await resolveChatResponder().respond({
    facts,
    demo,
    messages: messages as ChatMessage[],
  })

  const transcript = [...messages, { role: 'assistant' as const, content: result.reply }]
  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.siteId, site.id), eq(chatSessions.visitorId, sessionId)))
    .limit(1)
  let chatSessionId: string
  if (existing) {
    chatSessionId = existing.id
    await db
      .update(chatSessions)
      .set({
        messages: transcript,
        tokensIn: (existing.tokensIn ?? 0) + result.usage.inputTokens,
        tokensOut: (existing.tokensOut ?? 0) + result.usage.outputTokens,
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, existing.id))
  } else {
    const [created] = await db
      .insert(chatSessions)
      .values({
        siteId: site.id,
        visitorId: sessionId,
        messages: transcript,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        isDemo: demo,
      })
      .returning()
    if (!created) return NextResponse.json({ error: 'session write failed' }, { status: 500 })
    chatSessionId = created.id
  }

  if (result.lead && (result.lead.phone || result.lead.email)) {
    const [lead] = await db
      .insert(leads)
      .values({
        siteId: site.id,
        source: 'chatbot',
        name: result.lead.name ?? null,
        phone: result.lead.phone ?? null,
        email: result.lead.email ?? null,
        message: result.lead.message ?? null,
        chatSessionId,
      })
      .returning()
    if (lead) {
      scheduleLeadAlert(db, resolveMailer(), lead.id, { origin: request.nextUrl.origin })
    }
  }

  return NextResponse.json({ reply: result.reply })
}
