'use client'

import { useState, useTransition } from 'react'
import type { EntityType } from '@tradies/compliance'
import { chSearchUrl } from '@/lib/ch-link'
import { classifyEntity } from '@/server/actions/entity'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const OPTIONS: { value: EntityType; label: string; hint: string }[] = [
  { value: 'corporate', label: 'Corporate (Ltd / LLP / PLC)', hint: 'cold email allowed' },
  {
    value: 'individual',
    label: 'Individual (sole trader / partnership)',
    hint: 'PECR: consent required',
  },
  { value: 'unknown', label: 'Unknown', hint: 'treated as individual' },
]

export function EntityControl({
  prospectId,
  businessName,
  entityType,
  entityCheckedAt,
  companiesHouseNumber,
  latestNote,
}: {
  prospectId: string
  businessName: string
  entityType: EntityType
  entityCheckedAt: string | null
  companiesHouseNumber: string | null
  latestNote: string | null
}) {
  const [selected, setSelected] = useState<EntityType>(entityType)
  const [note, setNote] = useState('')
  const [chNumber, setChNumber] = useState(companiesHouseNumber ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await classifyEntity(
        prospectId,
        selected,
        note.trim() || undefined,
        chNumber.trim() || undefined,
      )
      if ('error' in result) setError(result.error)
      else setNote('')
    })
  }

  return (
    <div className="space-y-3" data-testid="entity-control">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Entity classification
        </span>
        <a
          href={chSearchUrl(businessName)}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Check on Companies House ↗
        </a>
      </div>
      <div className="space-y-1.5">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`entity-${prospectId}`}
              className="accent-indigo-600"
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
            />
            <span className="text-zinc-800">{option.label}</span>
            <span className="text-xs text-zinc-400">— {option.hint}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`ch-${prospectId}`}>Companies House number</Label>
          <Input
            id={`ch-${prospectId}`}
            value={chNumber}
            onChange={(event) => setChNumber(event.target.value)}
            placeholder="e.g. 08214563"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor={`note-${prospectId}`}>Note</Label>
          <Textarea
            id={`note-${prospectId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={1}
            placeholder="What did you check?"
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save classification'}
        </Button>
        {entityCheckedAt ? (
          <span className="text-xs text-zinc-500">
            Last checked {entityCheckedAt}
            {latestNote ? ` — “${latestNote}”` : ''}
          </span>
        ) : (
          <span className="text-xs text-zinc-500">Never checked</span>
        )}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <p className="rounded-md bg-zinc-50 px-2.5 py-2 text-xs leading-relaxed text-zinc-500">
        Cold email can only ever be queued for prospects marked corporate — marking is your decision
        and is audited.
      </p>
    </div>
  )
}
