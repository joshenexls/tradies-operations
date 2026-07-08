import { sql } from 'drizzle-orm'
import { describeReadiness, type ServiceMode, type ServiceStatus } from '@tradies/config/readiness'
import { checkMigrations, type MigrationStatus } from '@tradies/db/health'
import { getDb } from '@/lib/db'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

/**
 * Go-live readiness board. Every integration resolver defaults to a fixture
 * that succeeds silently, so a prod deploy missing a key looks green while
 * doing nothing — this page (and the sites /api/health it fetches) is the
 * surface that shows the founder the truth: per service, really wired or
 * faked, plus DB reachability and migration status.
 *
 * Cloudflare Workers each carry their OWN env, so the readiness computed here
 * reflects the OPS Worker only; the sites-scope services are cross-checked by
 * fetching the sites Worker's own /api/health?token=.
 */
export default async function StatusPage() {
  const report = describeReadiness()

  const db = getDb()
  let dbUp = false
  try {
    await db.execute(sql`select 1`)
    dbUp = true
  } catch {
    dbUp = false
  }
  let migrations: MigrationStatus | null = null
  if (dbUp) {
    try {
      migrations = await checkMigrations(db)
    } catch {
      migrations = null
    }
  }

  const sites = await fetchSitesHealth()

  const criticals = report.criticalWarnings
  const opsServices = report.services.filter((s) => s.scope !== 'sites')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Status</h1>
        <p className="text-sm text-zinc-500">
          Real-vs-fixture readiness for this deploy.{' '}
          {report.production ? (
            <span className="font-medium text-zinc-700">Production mode.</span>
          ) : (
            <span className="font-medium text-amber-700">
              Non-production — nothing is marked critical.
            </span>
          )}
        </p>
      </div>

      {criticals.length > 0 ? (
        <Card className="border-red-200" data-testid="status-criticals">
          <CardHeader
            title={<span className="text-red-700">{criticals.length} critical warning(s)</span>}
          />
          <CardBody className="space-y-1.5">
            {criticals.map((w) => (
              <p key={w} className="flex gap-2 text-sm text-red-700">
                <span aria-hidden>⚠</span>
                <span>{w}</span>
              </p>
            ))}
          </CardBody>
        </Card>
      ) : (
        <Card className="border-emerald-200" data-testid="status-nocriticals">
          <CardBody className="text-sm text-emerald-700">
            No critical misconfigurations for the current mode.
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Ops Worker"
          right={<HealthChips dbUp={dbUp} migrations={migrations} />}
        />
        <CardBody className="p-0">
          <ServiceTable services={opsServices} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sites Worker"
          right={
            sites.reachable ? (
              <HealthChips dbUp={sites.dbUp} migrations={sites.migrations} />
            ) : (
              <Badge tone="grey">unreachable</Badge>
            )
          }
        />
        <CardBody className={sites.reachable && sites.services ? 'p-0' : ''}>
          {sites.reachable ? (
            sites.services ? (
              <ServiceTable services={sites.services} />
            ) : (
              <p className="text-sm text-amber-700">
                Reached, but no HEALTH_TOKEN configured here — set HEALTH_TOKEN (matching the sites
                Worker) to see its service modes.
              </p>
            )
          ) : (
            <p className="text-sm text-zinc-500">
              Could not reach the sites health endpoint{sites.error ? ` (${sites.error})` : ''}. Set
              SITES_HEALTH_URL (or PREVIEW_URL_PATTERN) and HEALTH_TOKEN, and check{' '}
              <code>wrangler tail</code> on the sites Worker.
            </p>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-zinc-400">
        Modes only — no secret values are read or shown. Run <code>pnpm preflight</code> before a
        deploy to fail fast on a missing key.
      </p>
    </div>
  )
}

function HealthChips({ dbUp, migrations }: { dbUp: boolean; migrations: MigrationStatus | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <Badge tone={dbUp ? 'green' : 'red'}>DB {dbUp ? 'up' : 'down'}</Badge>
      {migrations ? (
        <Badge tone={migrations.upToDate ? 'green' : 'red'}>
          migrations {migrations.applied}/{migrations.expected}
        </Badge>
      ) : dbUp ? (
        <Badge tone="amber">migrations ?</Badge>
      ) : null}
    </div>
  )
}

function ServiceTable({ services }: { services: readonly RenderableService[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {services.map((s) => (
          <tr
            key={s.name}
            className="border-t border-zinc-100 first:border-t-0"
            data-testid="status-service-row"
          >
            <td className="w-px whitespace-nowrap px-4 py-2.5 align-top">
              <Badge tone={modeTone(s.mode, s.critical)}>{s.mode}</Badge>
            </td>
            <td className="px-2 py-2.5 align-top">
              <div className="font-medium text-zinc-800">{s.name}</div>
              <div className="text-xs text-zinc-500">{s.note}</div>
            </td>
            <td className="w-px px-4 py-2.5 text-right align-top">
              {s.critical ? <Badge tone="red">critical</Badge> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type RenderableService = Pick<ServiceStatus, 'name' | 'mode' | 'critical' | 'note'>

function modeTone(mode: ServiceMode, critical: boolean): BadgeTone {
  if (critical) return 'red'
  if (mode === 'real') return 'green'
  if (mode === 'disabled') return 'grey'
  return 'amber' // fixture / dry-run, deliberate
}

type SitesHealth = {
  reachable: boolean
  dbUp: boolean
  migrations: MigrationStatus | null
  services: RenderableService[] | null
  error?: string
}

function sitesHealthUrl(): string | null {
  const explicit = process.env.SITES_HEALTH_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const pattern = process.env.PREVIEW_URL_PATTERN
  if (!pattern) return null
  // any host that routes to the sites Worker serves /api/health
  const base = pattern.replaceAll('{slug}', 'www').replace(/\/+$/, '')
  return `${base}/api/health`
}

async function fetchSitesHealth(): Promise<SitesHealth> {
  const url = sitesHealthUrl()
  if (!url) return { reachable: false, dbUp: false, migrations: null, services: null }
  const token = process.env.HEALTH_TOKEN
  const full = token ? `${url}?token=${encodeURIComponent(token)}` : url
  try {
    const res = await fetch(full, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    const body = (await res.json()) as {
      db?: string
      migrations?: MigrationStatus | { error: string }
      services?: RenderableService[]
    }
    const migrations = body.migrations && 'applied' in body.migrations ? body.migrations : null
    return {
      reachable: true,
      dbUp: body.db === 'up',
      migrations,
      services: Array.isArray(body.services) ? body.services : null,
    }
  } catch (err) {
    return {
      reachable: false,
      dbUp: false,
      migrations: null,
      services: null,
      error: err instanceof Error ? err.name : 'fetch failed',
    }
  }
}
