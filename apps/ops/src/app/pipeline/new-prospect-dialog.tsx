'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createManualProspect } from '@/server/actions/prospects'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export function NewProspectDialog({
  styleKeys,
  trades,
}: {
  styleKeys: string[]
  trades: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: '',
    trade: trades[0] ?? 'plumber',
    town: '',
    phone: '',
    email: '',
    areas: '',
    services: '',
    styleKey: styleKeys.includes('modern') ? 'modern' : (styleKeys[0] ?? 'modern'),
  })

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await createManualProspect(form)
      if ('error' in result) setError(result.error)
      else router.push(`/prospects/${result.prospectId}`)
    })
  }

  const field = (key: keyof typeof form, label: string, placeholder: string, required = false) => (
    <div>
      <Label htmlFor={`np-${key}`}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <Input
        id={`np-${key}`}
        className="mt-1"
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => set(key)(event.target.value)}
      />
    </div>
  )

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New prospect
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New manual prospect" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('name', 'Business name', 'Smith Plumbing', true)}
          <div>
            <Label htmlFor="np-trade">Trade *</Label>
            <Select
              id="np-trade"
              className="mt-1 w-full"
              value={form.trade}
              onChange={(event) => set('trade')(event.target.value)}
            >
              {trades.map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </Select>
          </div>
          {field('town', 'Town', 'Leeds', true)}
          <div>
            <Label htmlFor="np-style">Design system</Label>
            <Select
              id="np-style"
              className="mt-1 w-full"
              value={form.styleKey}
              onChange={(event) => set('styleKey')(event.target.value)}
            >
              {styleKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </Select>
          </div>
          {field('phone', 'Phone', '0113 496 0123')}
          {field('email', 'Email', 'info@example.com')}
          {field('areas', 'Areas (comma-separated)', 'Leeds, Headingley, Otley')}
          {field('services', 'Services (comma-separated)', 'Boiler repair, Bathrooms')}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Everything typed here becomes operator-provenance facts — the generator can only state
          what you enter (FACT-GUARD enforces it). Saving generates a preview site immediately.
        </p>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Generating…' : 'Create & generate'}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
