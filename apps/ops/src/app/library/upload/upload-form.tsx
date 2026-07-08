'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadTemplate } from '@/server/actions/templates'
import type { IngestTemplateFailure } from '@/server/core/templates'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const TONES = ['friendly', 'professional', 'premium', 'no-nonsense']

async function readFileText(file: File | undefined): Promise<string | null> {
  if (!file) return null
  return await file.text()
}

export function UploadForm({ trades }: { trades: string[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<IngestTemplateFailure | null>(null)

  const [name, setName] = useState('')
  const [styleKey, setStyleKey] = useState('')
  const [trade, setTrade] = useState('')
  const [imageryPool, setImageryPool] = useState('trades-modern')
  const [tone, setTone] = useState('professional')
  const [rawHtml, setRawHtml] = useState('')
  const [componentsHtml, setComponentsHtml] = useState('')

  const submit = () => {
    setFailure(null)
    startTransition(async () => {
      const result = await uploadTemplate({
        name,
        styleKey,
        trade,
        imageryPool,
        tone,
        rawHtml,
        componentsHtml,
      })
      if (result.ok) router.push(`/library/templates/${result.templateId}`)
      else setFailure(result)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="System details" />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Craftsman Dark"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-style-key">Style key</Label>
              <Input
                id="tpl-style-key"
                value={styleKey}
                onChange={(e) => setStyleKey(e.target.value.toLowerCase())}
                placeholder="craftsman-dark"
                className="font-mono"
              />
              <p className="text-xs text-zinc-400">
                Lowercase slug — shared across trade specialisations.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-trade">Trade</Label>
              <Select
                id="tpl-trade"
                className="w-full"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
              >
                <option value="">generic</option>
                {trades.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-tone">Tone</Label>
              <Select
                id="tpl-tone"
                className="w-full"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="tpl-pool">Imagery pool</Label>
              <Input
                id="tpl-pool"
                value={imageryPool}
                onChange={(e) => setImageryPool(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lander HTML" />
        <CardBody className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="tpl-file">Upload file</Label>
            <input
              id="tpl-file"
              type="file"
              accept=".html,.htm,text/html"
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
              onChange={async (e) => {
                const text = await readFileText(e.target.files?.[0])
                if (text !== null) setRawHtml(text)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-html">…or paste it</Label>
            <Textarea
              id="tpl-html"
              rows={12}
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              placeholder="<!doctype html>…"
              className="font-mono text-xs"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Components / style reference (optional)" />
        <CardBody className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="tpl-components-file">Upload file</Label>
            <input
              id="tpl-components-file"
              type="file"
              accept=".html,.htm,.css,text/html,text/css"
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
              onChange={async (e) => {
                const text = await readFileText(e.target.files?.[0])
                if (text !== null) setComponentsHtml(text)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-components">…or paste it</Label>
            <Textarea
              id="tpl-components"
              rows={4}
              value={componentsHtml}
              onChange={(e) => setComponentsHtml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={submit}>
          {pending ? 'Ingesting…' : 'Upload & ingest'}
        </Button>
        <p className="text-xs text-zinc-400">
          Sanitize → annotate → validate. Nothing goes live until you activate it.
        </p>
      </div>

      {failure ? (
        <Card data-testid="ingest-failure">
          <CardHeader title="Ingest failed" />
          <CardBody className="space-y-3 text-sm">
            <p className="font-medium text-red-700">{failure.message}</p>
            {failure.problems.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Problems (last attempt of {failure.attempts})
                </h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                  {failure.problems.map((problem, i) => (
                    <li key={i} className="break-all">
                      {problem}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {failure.sanitizationReport ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Sanitization report
                </h3>
                <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-zinc-600">
                  <dt>Removed scripts</dt>
                  <dd className="break-all">
                    {failure.sanitizationReport.removedScripts.join('; ') || '—'}
                  </dd>
                  <dt>Removed external refs</dt>
                  <dd className="break-all">
                    {failure.sanitizationReport.removedExternalRefs.join('; ') || '—'}
                  </dd>
                  <dt>Neutralized forms</dt>
                  <dd>{failure.sanitizationReport.neutralizedForms}</dd>
                  <dt>External images</dt>
                  <dd>{failure.sanitizationReport.externalImages}</dd>
                  <dt>Demoted h1s</dt>
                  <dd>{failure.sanitizationReport.demotedH1s}</dd>
                  <dt>Kept maps embeds</dt>
                  <dd>{failure.sanitizationReport.keptMapsEmbeds}</dd>
                </dl>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
