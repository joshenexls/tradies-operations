import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { designTemplates, stylePresets } from '@tradies/db/schema'
import { sanitizationReportSchema } from '@tradies/html-templates'
import { getDb } from '@/lib/db'
import { isUuid } from '@/lib/uuid'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Table, TableShell, Td, Th } from '@/components/ui/table'
import { TemplateActions } from './template-actions'

export const dynamic = 'force-dynamic'

const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'green',
  draft: 'amber',
  retired: 'grey',
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  if (!isUuid(templateId)) notFound()
  const db = getDb()
  const [row] = await db
    .select()
    .from(designTemplates)
    .where(eq(designTemplates.id, templateId))
    .limit(1)
  if (!row) notFound()
  const presets = await db
    .select()
    .from(stylePresets)
    .where(eq(stylePresets.designTemplateId, templateId))

  const manifest = row.slotManifest
  const sanitization = sanitizationReportSchema.safeParse(row.sanitizationReport)
  const validation = row.validationReport

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{row.name}</h1>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge tone="indigo">HTML system</Badge>
            <Badge tone={STATUS_TONES[row.status] ?? 'grey'} data-testid="template-status">
              {row.status}
            </Badge>
            {presets.map((preset) => (
              <Badge key={preset.id} tone={preset.trade ? 'blue' : 'grey'}>
                {preset.styleKey} · {preset.trade ?? 'generic'}
              </Badge>
            ))}
          </div>
        </div>
        <TemplateActions templateId={row.id} status={row.status} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Design tokens" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Palette
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(row.tokens?.palette ?? []).map((hex) => (
                    <span key={hex} className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className="h-5 w-5 rounded border border-zinc-200"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="font-mono text-zinc-600">{hex}</span>
                    </span>
                  ))}
                  {(row.tokens?.palette ?? []).length === 0 ? (
                    <span className="text-zinc-400">No hex colours found</span>
                  ) : null}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Fonts
                </h3>
                <p className="mt-1 text-zinc-700">
                  {(row.tokens?.fonts ?? []).join(', ') || 'No declared font families'}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                <dt>Ingest model</dt>
                <dd className="font-mono">{row.ingestModel ?? '—'}</dd>
                <dt>Components file</dt>
                <dd>{row.componentsHtml ? `${row.componentsHtml.length} chars` : '—'}</dd>
                <dt>Created by</dt>
                <dd>{row.createdBy ?? '—'}</dd>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Slot manifest" />
            <CardBody className="space-y-3">
              {manifest ? (
                <>
                  <TableShell data-testid="manifest-table" className="shadow-none">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Slot</Th>
                          <Th>Kind</Th>
                          <Th>Min</Th>
                          <Th>Max</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {manifest.slots.map((slot) => (
                          <tr key={slot.id} data-testid="manifest-slot-row">
                            <Td className="font-mono text-xs">{slot.id}</Td>
                            <Td>{slot.kind}</Td>
                            <Td>{slot.minLength}</Td>
                            <Td>{slot.maxLength}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableShell>
                  {manifest.repeats.map((group) => (
                    <div key={group.id} className="text-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Repeat <span className="font-mono normal-case">{group.id}</span> (
                        {group.minItems}–{group.maxItems} items)
                      </h3>
                      <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                        {group.itemSlots.map((slot) => (
                          <li key={slot.id}>
                            <span className="font-mono">{slot.id}</span> — {slot.kind} (
                            {slot.minLength}–{slot.maxLength})
                          </li>
                        ))}
                        {group.itemImages.map((image) => (
                          <li key={image.id}>
                            <span className="font-mono">{image.id}</span> — image
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                    <dt>Standalone images</dt>
                    <dd className="font-mono">
                      {manifest.images.map((image) => image.id).join(', ') || '—'}
                    </dd>
                    <dt>Lead form</dt>
                    <dd>{manifest.form.present ? 'present' : 'not present'}</dd>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-zinc-400">
                  No manifest stored — the last ingest did not complete.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Sanitization report" />
            <CardBody>
              {sanitization.success ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs text-zinc-600">
                  <dt className="font-medium text-zinc-500">Removed scripts</dt>
                  <dd className="break-all font-mono" data-testid="removed-scripts">
                    {sanitization.data.removedScripts.join('; ') || '—'}
                  </dd>
                  <dt className="font-medium text-zinc-500">Removed external refs</dt>
                  <dd className="break-all font-mono">
                    {sanitization.data.removedExternalRefs.join('; ') || '—'}
                  </dd>
                  <dt className="font-medium text-zinc-500">Neutralized forms</dt>
                  <dd>{sanitization.data.neutralizedForms}</dd>
                  <dt className="font-medium text-zinc-500">External images pooled</dt>
                  <dd>{sanitization.data.externalImages}</dd>
                  <dt className="font-medium text-zinc-500">Demoted extra h1s</dt>
                  <dd>{sanitization.data.demotedH1s}</dd>
                  <dt className="font-medium text-zinc-500">Kept maps embeds</dt>
                  <dd>{sanitization.data.keptMapsEmbeds}</dd>
                </dl>
              ) : (
                <p className="text-sm text-zinc-400">No sanitization report stored.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stripped regions" />
            <CardBody>
              {manifest && manifest.strippedRegions.length > 0 ? (
                <ul className="space-y-1 text-sm text-zinc-700" data-testid="stripped-regions">
                  {manifest.strippedRegions.map((region) => (
                    <li key={region.id} className="flex items-center gap-2">
                      <span className="font-mono text-xs">{region.id}</span>
                      <Badge tone="red">{region.reason}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-400">
                  Nothing stripped — the upload carried no testimonial/review blocks.
                </p>
              )}
              <p className="mt-2 text-xs text-zinc-400">
                Fabricated quotes and reviews are removed at ingest (DMCC) — this records what went
                and why.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Validation"
              right={
                validation ? (
                  <Badge tone={validation.ok ? 'green' : 'red'}>
                    {validation.ok ? 'passed' : 'failed'}
                  </Badge>
                ) : null
              }
            />
            <CardBody>
              {validation ? (
                validation.ok ? (
                  <p className="text-sm text-zinc-600">
                    Annotated template agrees with its manifest and is sanitizer-clean.
                  </p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                    {validation.problems.map((problem, i) => (
                      <li key={i} className="break-all">
                        {problem}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="text-sm text-zinc-400">No validation report stored.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Draft preview"
          right={
            <Link
              href={`/library/templates/${row.id}/preview`}
              target="_blank"
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Open full size
            </Link>
          }
        />
        <CardBody>
          {row.annotatedHtml && manifest ? (
            <iframe
              src={`/library/templates/${row.id}/preview`}
              title={`Preview of ${row.name}`}
              data-testid="template-preview"
              sandbox=""
              className="h-[640px] w-full rounded border border-zinc-200 bg-white"
            />
          ) : (
            <p className="text-sm text-zinc-400">No annotated template to preview yet.</p>
          )}
          <p className="mt-2 text-xs text-zinc-400">
            Rendered with deterministic fixture content for Swift Flow Plumbing — not real
            generation output.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
