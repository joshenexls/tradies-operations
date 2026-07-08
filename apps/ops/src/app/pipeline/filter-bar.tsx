'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type Filters = {
  status?: string
  segment?: string
  trade?: string
  entityType?: string
  city?: string
}

export function FilterBar({
  current,
  options,
}: {
  current: Filters
  options: { statuses: string[]; segments: string[]; trades: string[]; entityTypes: string[] }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const query = params.toString()
    router.push(query ? `/pipeline?${query}` : '/pipeline')
  }

  const select = (key: keyof Filters, label: string, values: string[], allLabel: string) => (
    <div>
      <Label htmlFor={`filter-${key}`}>{label}</Label>
      <Select
        id={`filter-${key}`}
        className="mt-1 w-full"
        value={current[key] ?? ''}
        onChange={(event) => update(key, event.target.value)}
      >
        <option value="">{allLabel}</option>
        {values.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
    </div>
  )

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
      {select('status', 'Status', options.statuses, 'Any status')}
      {select('segment', 'Segment', options.segments, 'Any segment')}
      {select('trade', 'Trade', options.trades, 'Any trade')}
      {select('entityType', 'Entity', options.entityTypes, 'Any entity')}
      <div>
        <Label htmlFor="filter-city">City</Label>
        <Input
          id="filter-city"
          className="mt-1"
          placeholder="e.g. Leeds"
          defaultValue={current.city ?? ''}
          onKeyDown={(event) => {
            if (event.key === 'Enter') update('city', event.currentTarget.value.trim())
          }}
          onBlur={(event) => {
            if (event.target.value.trim() !== (current.city ?? '')) {
              update('city', event.target.value.trim())
            }
          }}
        />
      </div>
      <div className="flex items-end">
        <button
          type="button"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800"
          onClick={() => router.push('/pipeline')}
        >
          Clear filters
        </button>
      </div>
    </div>
  )
}
