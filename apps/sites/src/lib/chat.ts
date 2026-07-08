import { AnthropicChatResponder, FixtureChatResponder, type ChatResponder } from '@tradies/llm'

/**
 * CHAT_RESPONDER=fixture (default) keeps the widget answering offline;
 * =anthropic requires ANTHROPIC_API_KEY and uses CHAT_MODEL (Haiku default —
 * the chatbot answers only from the facts sheet, it needs speed not depth).
 */
export function resolveChatResponder(env: NodeJS.ProcessEnv = process.env): ChatResponder {
  const mode = env.CHAT_RESPONDER ?? 'fixture'
  if (mode === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('CHAT_RESPONDER=anthropic requires ANTHROPIC_API_KEY')
    return new AnthropicChatResponder({ apiKey, model: env.CHAT_MODEL ?? 'claude-haiku-4-5' })
  }
  if (mode !== 'fixture') throw new Error(`Unknown CHAT_RESPONDER "${mode}" (fixture | anthropic)`)
  return new FixtureChatResponder()
}

type Bucket = { count: number; resetAt: number }

/**
 * Fixed-window in-memory rate limiter. Per-isolate only — good enough to stop
 * a single visitor hammering the Haiku spend; a DB counter can replace it if
 * multi-isolate abuse ever shows up in the chat_sessions usage columns.
 */
export class ChatRateLimiter {
  private buckets = new Map<string, Bucket>()

  constructor(
    private limits: { perSession: number; perSite: number; windowMs: number },
    private now: () => number = Date.now,
  ) {}

  /** True when this message is allowed; false → caller returns 429. */
  allow(input: { siteId: string; sessionId: string; ip: string | null }): boolean {
    const ts = this.now()
    // sweep opportunistically so long-lived isolates don't grow unbounded
    if (this.buckets.size > 10_000) {
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= ts) this.buckets.delete(key)
    }
    const checks: { key: string; limit: number }[] = [
      { key: `session:${input.siteId}:${input.sessionId}`, limit: this.limits.perSession },
      { key: `site:${input.siteId}`, limit: this.limits.perSite },
    ]
    if (input.ip) checks.push({ key: `ip:${input.ip}`, limit: this.limits.perSession })
    // check all before counting any, so a rejected request burns no quota
    const buckets = checks.map(({ key, limit }) => {
      let bucket = this.buckets.get(key)
      if (!bucket || bucket.resetAt <= ts) {
        bucket = { count: 0, resetAt: ts + this.limits.windowMs }
        this.buckets.set(key, bucket)
      }
      return { bucket, limit }
    })
    if (buckets.some(({ bucket, limit }) => bucket.count >= limit)) return false
    for (const { bucket } of buckets) bucket.count += 1
    return true
  }
}

const globalForChat = globalThis as unknown as { __tradiesChatLimiter?: ChatRateLimiter }

export function getChatRateLimiter(): ChatRateLimiter {
  return (globalForChat.__tradiesChatLimiter ??= new ChatRateLimiter({
    perSession: Number(process.env.CHAT_RATE_PER_SESSION ?? 20),
    perSite: Number(process.env.CHAT_RATE_PER_SITE ?? 200),
    windowMs: Number(process.env.CHAT_RATE_WINDOW_SEC ?? 3600) * 1000,
  }))
}
