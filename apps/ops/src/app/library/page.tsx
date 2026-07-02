import Link from 'next/link'
import type { StylePresetRow } from '@tradies/db'
import { stylePresets } from '@tradies/db/schema'
import { FONT_PAIRS, PALETTES } from '@tradies/site-spec'
import { getDb } from '@/lib/db'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { CardActions } from './card-actions'

export const dynamic = 'force-dynamic'

const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'green',
  draft: 'amber',
  retired: 'grey',
}

function Swatches({ paletteId }: { paletteId: string }) {
  const palette = PALETTES.find((p) => p.id === paletteId)
  if (!palette) return null
  const colors = [palette.primary, palette.accent, palette.surfaceAlt, palette.ink]
  return (
    <span className="inline-flex overflow-hidden rounded border border-zinc-200">
      {colors.map((color, i) => (
        <span key={i} className="h-4 w-6" style={{ backgroundColor: color }} />
      ))}
    </span>
  )
}

export default async function LibraryPage() {
  const db = getDb()
  const rows = await db
    .select()
    .from(stylePresets)
    .orderBy(stylePresets.styleKey, stylePresets.name)

  const groups = new Map<string, StylePresetRow[]>()
  for (const row of rows) {
    const group = groups.get(row.styleKey) ?? []
    group.push(row)
    groups.set(row.styleKey, group)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Design library</h1>
          <p className="text-sm text-zinc-500">
            Curated systems the generator must stay inside — trade specialisations win over generic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/library/upload"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            Upload design system
          </Link>
          <Link
            href="/library/new"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            New system
          </Link>
        </div>
      </div>

      {[...groups.entries()].map(([styleKey, presets]) => (
        <section key={styleKey} className="space-y-2">
          <h2 className="font-mono text-sm font-semibold text-zinc-500">{styleKey}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {presets.map((preset) => (
              <Card key={preset.id} data-testid="preset-card">
                <CardBody className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">{preset.name}</h3>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge tone={preset.kind === 'html' ? 'indigo' : 'grey'}>
                          {preset.kind === 'html' ? 'HTML system' : 'Component'}
                        </Badge>
                        <Badge tone={preset.trade ? 'blue' : 'grey'}>
                          {preset.trade ?? 'generic'}
                        </Badge>
                        <Badge tone={STATUS_TONES[preset.status] ?? 'grey'}>{preset.status}</Badge>
                      </div>
                    </div>
                    <Swatches paletteId={preset.paletteId} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <dt>Template</dt>
                    <dd className="font-mono">{preset.templateId}</dd>
                    <dt>Fonts</dt>
                    <dd>
                      {FONT_PAIRS.find((f) => f.id === preset.fontPairId)?.name ??
                        preset.fontPairId}
                    </dd>
                    <dt>Tone</dt>
                    <dd>{preset.tone ?? '—'}</dd>
                    <dt>Imagery pool</dt>
                    <dd className="font-mono">{preset.imageryPool ?? '—'}</dd>
                  </dl>
                  <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
                    {preset.kind === 'html' && preset.designTemplateId ? (
                      <Link
                        href={`/library/templates/${preset.designTemplateId}`}
                        aria-label={`Details for ${preset.name}`}
                        className="text-sm font-medium text-indigo-600 hover:underline"
                      >
                        Details
                      </Link>
                    ) : (
                      <Link
                        href={`/library/${preset.id}`}
                        aria-label={`Edit ${preset.name}`}
                        className="text-sm font-medium text-indigo-600 hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                    <CardActions presetId={preset.id} status={preset.status} />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">Library is empty — run the seed script.</p>
      ) : null}
    </div>
  )
}
