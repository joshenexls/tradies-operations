import { sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { describeReadiness } from '@tradies/config/readiness'
import { checkMigrations } from '@tradies/db/health'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Health + readiness for the sites Worker.
 *
 * Public (`GET /api/health`): liveness only — `{ ok, db, time }`. Safe to
 * point an uptime probe at; it exposes no configuration.
 *
 * Authenticated (`?token=` matching HEALTH_TOKEN): the full sites-scope
 * readiness board — DB reachability, migration status, and each service's
 * real-vs-fixture mode from describeReadiness. This is the surface that tells
 * the founder whether Stripe/email/chat are really wired after a deploy or
 * silently faked. It returns MODES and booleans only — never a secret value.
 */
export async function GET(request: NextRequest) {
  const db = getDb()

  let dbUp = false
  try {
    await db.execute(sql`select 1`)
    dbUp = true
  } catch {
    dbUp = false
  }

  const base = { ok: dbUp, db: dbUp ? 'up' : 'down', time: new Date().toISOString() } as const
  const noStore = { headers: { 'cache-control': 'no-store' } }

  const token = request.nextUrl.searchParams.get('token')
  const expected = process.env.HEALTH_TOKEN
  const authed = Boolean(expected) && token === expected
  if (!authed) {
    // Unauthenticated (or no token configured): liveness only, no config leak.
    return NextResponse.json(base, { status: dbUp ? 200 : 503, ...noStore })
  }

  const report = describeReadiness()
  // Only the services this Worker actually runs (plus shared) — the ops/jobs
  // scopes live in other Workers with their own env (see ops /status).
  const services = report.services
    .filter((s) => s.scope === 'sites' || s.scope === 'shared')
    .map((s) => ({ name: s.name, mode: s.mode, critical: s.critical, note: s.note }))

  let migrations: Awaited<ReturnType<typeof checkMigrations>> | { error: string } = {
    error: 'db unreachable',
  }
  if (dbUp) {
    try {
      migrations = await checkMigrations(db)
    } catch (err) {
      migrations = { error: err instanceof Error ? err.message : 'migration check failed' }
    }
  }

  return NextResponse.json(
    {
      ...base,
      production: report.production,
      dbDriver: report.db.driver,
      migrations,
      services,
      criticalWarnings: report.criticalWarnings,
    },
    { status: dbUp ? 200 : 503, ...noStore },
  )
}
