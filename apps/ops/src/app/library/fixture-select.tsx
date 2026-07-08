'use client'

import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export function FixtureSelect({
  presetId,
  fixtures,
  current,
}: {
  presetId: string
  fixtures: { key: string; label: string }[]
  current: string
}) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="fixture-select" className="whitespace-nowrap">
        Sample business
      </Label>
      <Select
        id="fixture-select"
        value={current}
        onChange={(event) =>
          router.push(`/library/${presetId}?fixture=${encodeURIComponent(event.target.value)}`, {
            scroll: false,
          })
        }
      >
        {fixtures.map((fixture) => (
          <option key={fixture.key} value={fixture.key}>
            {fixture.label}
          </option>
        ))}
      </Select>
    </div>
  )
}
