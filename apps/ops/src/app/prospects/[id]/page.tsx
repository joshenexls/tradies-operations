import { desc, eq, inArray, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { checkSuppression } from '@tradies/compliance'
import {
  customers,
  events,
  permissionEvents,
  prospectCosts,
  prospects,
  siteSpecs,
  sites,
  subscriptions,
  suppressionList,
} from '@tradies/db/schema'
import { listActivePresets } from '@tradies/engine'
import { getDb } from '@/lib/db'
import { formatDate, formatMicroGbp, relativeTime } from '@/lib/format'
import { claimUrl, portalUrl } from '@/lib/portal-url'
import { operatorPreviewUrl } from '@/lib/preview-url'
import { latestEntityNote, previewEngagement } from '@/lib/queries'
import { isUuid } from '@/lib/uuid'
import { EntityControl } from '@/components/entity-control'
import {
  Badge,
  customerTone,
  entityTone,
  segmentTone,
  statusTone,
  subscriptionTone,
} from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Table, TableShell, Td, Th } from '@/components/ui/table'
import { ActionsBar } from './actions-bar'
import { LifecycleControls } from './lifecycle-controls'

export const dynamic = 'force-dynamic'

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const db = getDb()
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1)
  if (!prospect) notFound()

  const [site] = await db.select().from(sites).where(eq(sites.prospectId, id)).limit(1)
  const [customer] = site
    ? await db.select().from(customers).where(eq(customers.siteId, site.id)).limit(1)
    : []
  const [subscription] = customer
    ? await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.customerId, customer.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1)
    : []
  const specs = await db
    .select()
    .from(siteSpecs)
    .where(eq(siteSpecs.prospectId, id))
    .orderBy(desc(siteSpecs.version))
  const timeline = await db
    .select()
    .from(events)
    .where(
      site ? or(eq(events.prospectId, id), eq(events.siteId, site.id)) : eq(events.prospectId, id),
    )
    .orderBy(desc(events.createdAt))
    .limit(100)
  const costs = await db
    .select()
    .from(prospectCosts)
    .where(eq(prospectCosts.prospectId, id))
    .orderBy(desc(prospectCosts.createdAt))
  const permissions = await db
    .select()
    .from(permissionEvents)
    .where(eq(permissionEvents.prospectId, id))
    .orderBy(desc(permissionEvents.createdAt))

  const suppressionEntries = await db
    .select({ kind: suppressionList.kind, value: suppressionList.value })
    .from(suppressionList)
    .where(inArray(suppressionList.kind, ['email', 'domain', 'phone', 'place_id']))
  const suppression = checkSuppression(suppressionEntries, {
    email: prospect.extractedProfile?.email?.value,
    phone: prospect.phone ?? undefined,
    placeId: prospect.placeId ?? undefined,
  })

  const presetOptions = (await listActivePresets(db)).map(({ row }) => ({
    id: row.id,
    name: row.name,
    trade: row.trade,
  }))
  const note = await latestEntityNote(db, id)
  const currentSpec = specs.find((s) => s.version === site?.currentSpecVersion)
  const totalCost = costs.reduce((sum, cost) => sum + (cost.amountMicroGbp ?? 0), 0)
  const engagement = (await previewEngagement(db, [id])).get(id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {prospect.businessName ?? '(unnamed)'}
            <Badge tone={statusTone(prospect.status)} data-testid="status-badge">
              {prospect.status}
            </Badge>
            {prospect.segment ? (
              <Badge tone={segmentTone(prospect.segment)}>{prospect.segment}</Badge>
            ) : null}
            <Badge tone={entityTone(prospect.entityType)} data-testid="entity-badge">
              {prospect.entityType}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {prospect.trade ?? 'no trade'} · {prospect.city ?? 'no city'} · source{' '}
            {prospect.source ?? '—'} ·{' '}
            <span className="font-mono text-xs text-zinc-400">{prospect.id}</span>
          </p>
          <p className="mt-1 space-x-3 text-sm">
            {site ? (
              <a
                href={operatorPreviewUrl(site.slug)}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                Preview {site.slug} ↗
              </a>
            ) : (
              <span className="text-zinc-400">No site yet</span>
            )}
            {site ? (
              engagement && engagement.visits > 0 ? (
                <span className="font-medium text-emerald-700" data-testid="engagement">
                  Opened {engagement.visits}×
                  {engagement.devices > 0
                    ? ` from ${engagement.devices} device${engagement.devices === 1 ? '' : 's'}`
                    : ''}
                  {engagement.lastVisitAt ? `, last ${relativeTime(engagement.lastVisitAt)}` : ''}
                </span>
              ) : (
                <span className="text-zinc-400" data-testid="engagement">
                  Not opened yet
                </span>
              )
            ) : null}
            {customer ? (
              <span className="space-x-1">
                <Badge tone={customerTone(customer.status)} data-testid="customer-badge">
                  customer {customer.status ?? '—'}
                </Badge>
                {subscription ? (
                  <Badge
                    tone={subscriptionTone(subscription.status)}
                    data-testid="subscription-badge"
                  >
                    sub {subscription.status ?? '—'}
                  </Badge>
                ) : null}
              </span>
            ) : null}
          </p>
          {site ? (
            <p className="mt-2 text-sm">
              <LifecycleControls
                siteId={site.id}
                siteStatus={site.status}
                claimUrl={site.claimToken ? claimUrl(site.slug, site.claimToken) : null}
                claimToken={site.claimToken}
                portalUrl={site.portalToken ? portalUrl(site.slug, site.portalToken) : null}
                portalToken={site.portalToken}
              />
            </p>
          ) : null}
        </div>
        <ActionsBar
          prospectId={prospect.id}
          presets={presetOptions}
          currentPresetId={currentSpec?.stylePresetId ?? null}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Legal"
            right={
              suppression.suppressed ? (
                <Badge tone="red">
                  suppressed: {suppression.matches.map((m) => m.kind).join(', ')}
                </Badge>
              ) : (
                <Badge tone="green">not suppressed</Badge>
              )
            }
          />
          <CardBody className="space-y-4">
            <EntityControl
              prospectId={prospect.id}
              businessName={prospect.businessName ?? ''}
              entityType={prospect.entityType}
              entityCheckedAt={
                prospect.entityCheckedAt ? relativeTime(prospect.entityCheckedAt) : null
              }
              companiesHouseNumber={prospect.companiesHouseNumber}
              latestNote={note}
            />
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Permission events
              </h3>
              {permissions.length > 0 ? (
                <ul className="mt-1.5 space-y-1 text-sm">
                  {permissions.map((event) => (
                    <li key={event.id} className="flex items-center gap-2">
                      <span className="font-mono text-xs">{event.kind}</span>
                      {event.channel ? (
                        <span className="text-xs text-zinc-400">via {event.channel}</span>
                      ) : null}
                      <span className="text-xs text-zinc-400">{relativeTime(event.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-zinc-400">None recorded.</p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Timeline" />
          <CardBody data-testid="timeline" className="max-h-[420px] space-y-2 overflow-y-auto">
            {timeline.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-sm">
                <Badge tone={event.actor === 'operator' ? 'indigo' : 'grey'}>{event.actor}</Badge>
                <div className="min-w-0">
                  <span className="font-mono text-xs text-zinc-800">{event.type}</span>
                  <span className="ml-2 text-xs text-zinc-400">
                    {relativeTime(event.createdAt)}
                  </span>
                  {event.payload != null ? (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-xs text-zinc-400">payload</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[11px] text-zinc-600">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </div>
            ))}
            {timeline.length === 0 ? <p className="text-sm text-zinc-400">No events yet.</p> : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Spec versions" />
        <TableShell className="rounded-none border-x-0 border-b-0 shadow-none">
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Model</Th>
                <Th>Prompt</Th>
                <Th>By</Th>
                <Th>Feedback</Th>
                <Th>Validation</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {specs.map((spec) => {
                const current = spec.version === site?.currentSpecVersion
                return (
                  <tr key={spec.id} className={current ? 'bg-indigo-50/50' : undefined}>
                    <Td className="font-mono text-xs">
                      v{spec.version}
                      {current ? (
                        <Badge tone="indigo" className="ml-2">
                          current
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="font-mono text-xs">{spec.model ?? '—'}</Td>
                    <Td className="font-mono text-xs">{spec.promptVersion ?? '—'}</Td>
                    <Td>{spec.generatedBy ?? '—'}</Td>
                    <Td className="max-w-56 truncate text-xs text-zinc-500">
                      {spec.regenerateFeedback ?? '—'}
                    </Td>
                    <Td>
                      <span className="space-x-1">
                        <Badge tone={spec.validationReport?.fact.ok ? 'green' : 'red'}>
                          facts {spec.validationReport?.fact.ok ? 'ok' : 'fail'}
                        </Badge>
                        <Badge tone={spec.validationReport?.preset.ok ? 'green' : 'red'}>
                          preset {spec.validationReport?.preset.ok ? 'ok' : 'fail'}
                        </Badge>
                      </span>
                    </Td>
                    <Td className="text-xs text-zinc-500">{formatDate(spec.createdAt)}</Td>
                  </tr>
                )
              })}
              {specs.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="py-6 text-center text-zinc-400">
                    No spec versions — generate one from the actions bar.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </TableShell>
      </Card>

      <Card>
        <CardHeader
          title="Costs"
          right={<span className="font-mono text-sm">{formatMicroGbp(totalCost)}</span>}
        />
        <TableShell className="rounded-none border-x-0 border-b-0 shadow-none">
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Provider</Th>
                <Th>Units</Th>
                <Th>Amount</Th>
                <Th>Ref</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {costs.map((cost) => (
                <tr key={cost.id}>
                  <Td>{cost.category}</Td>
                  <Td className="font-mono text-xs">{cost.provider ?? '—'}</Td>
                  <Td className="font-mono text-xs">{cost.units ?? '—'}</Td>
                  <Td className="font-mono text-xs">{formatMicroGbp(cost.amountMicroGbp ?? 0)}</Td>
                  <Td className="font-mono text-xs">{cost.ref ?? '—'}</Td>
                  <Td className="text-xs text-zinc-500">{formatDate(cost.createdAt)}</Td>
                </tr>
              ))}
              {costs.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="py-6 text-center text-zinc-400">
                    No costs recorded.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </TableShell>
      </Card>
    </div>
  )
}
