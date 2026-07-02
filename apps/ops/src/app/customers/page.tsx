import Link from 'next/link'
import { getDb } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { portalUrl } from '@/lib/portal-url'
import { operatorPreviewUrl } from '@/lib/preview-url'
import { customerStats, listCustomers } from '@/server/core/customers'
import { Badge, customerTone, siteTone, subscriptionTone } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { Table, TableShell, Td, Th } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const db = getDb()
  const rows = await listCustomers(db)
  const stats = customerStats(rows, Number(process.env.PRICE_MONTHLY_PENCE ?? 1999))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-zinc-500" data-testid="customer-stats">
          {rows.length} customer{rows.length === 1 ? '' : 's'} ·{' '}
          <span className="font-medium text-zinc-700">
            {stats.activeCount} active subscription{stats.activeCount === 1 ? '' : 's'}
          </span>{' '}
          ·{' '}
          <span className="font-medium text-zinc-700">
            £{(stats.mrrPence / 100).toFixed(2)} MRR
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-zinc-400">
            No customers yet — claimed sites with a completed checkout appear here.
          </CardBody>
        </Card>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th>Business</Th>
                <Th>Email</Th>
                <Th>Customer</Th>
                <Th>Subscription</Th>
                <Th>Period ends</Th>
                <Th>Site</Th>
                <Th>Links</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ customer, subscription, site, businessName }) => (
                <tr key={customer.id} data-testid="customer-row">
                  <Td>
                    <Link
                      href={`/prospects/${customer.prospectId}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {businessName ?? '(unnamed)'}
                    </Link>
                  </Td>
                  <Td className="text-zinc-500">{customer.email ?? '—'}</Td>
                  <Td>
                    <Badge tone={customerTone(customer.status)}>{customer.status ?? '—'}</Badge>
                  </Td>
                  <Td>
                    {subscription ? (
                      <Badge tone={subscriptionTone(subscription.status)}>
                        {subscription.status ?? '—'}
                      </Badge>
                    ) : (
                      <span className="text-zinc-400">none</span>
                    )}
                  </Td>
                  <Td className="text-xs text-zinc-500">
                    {subscription?.currentPeriodEnd
                      ? formatDate(subscription.currentPeriodEnd)
                      : '—'}
                  </Td>
                  <Td>
                    <Badge tone={siteTone(site.status)}>{site.status}</Badge>
                  </Td>
                  <Td className="space-x-3 text-xs">
                    <a
                      href={operatorPreviewUrl(site.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      Site ↗
                    </a>
                    {site.portalToken ? (
                      <a
                        href={portalUrl(site.slug, site.portalToken)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        Portal ↗
                      </a>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableShell>
      )}
    </div>
  )
}
