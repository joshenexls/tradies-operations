'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePreset, type PresetFormData } from '@/server/actions/presets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PresetFormOptions } from './form-options'

export type PresetFormInitial = {
  id: string | null
  styleKey: string
  name: string
  trade: string
  templateId: string
  description: string
  paletteId: string
  fontPairId: string
  radius: string
  tone: string
  imageryPool: string
  preferredSections: string[]
  variantWeights: Record<string, Record<string, number>>
  status: string
}

const RADII = ['sharp', 'soft', 'round']
const TONES = ['friendly', 'professional', 'premium', 'no-nonsense']
const STATUSES = ['active', 'draft', 'retired']

export function PresetForm({
  initial,
  options,
}: {
  initial: PresetFormInitial
  options: PresetFormOptions
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    styleKey: initial.styleKey,
    name: initial.name,
    trade: initial.trade,
    templateId: initial.templateId,
    description: initial.description,
    paletteId: initial.paletteId,
    fontPairId: initial.fontPairId,
    radius: initial.radius,
    tone: initial.tone,
    imageryPool: initial.imageryPool,
    status: initial.status,
  })
  const [preferredSections, setPreferredSections] = useState<string[]>(initial.preferredSections)
  // '' means "unset" — a kind with no set weights allows all variants equally
  const [weights, setWeights] = useState<Record<string, Record<string, string>>>(() => {
    const state: Record<string, Record<string, string>> = {}
    for (const [kind, variants] of Object.entries(options.sectionVariants)) {
      state[kind] = {}
      for (const variant of variants) {
        const existing = initial.variantWeights[kind]?.[variant]
        state[kind][variant] = existing === undefined ? '' : String(existing)
      }
    }
    return state
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const set = (key: keyof typeof form) => (value: string) => {
    setSaved(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const submit = () => {
    setError(null)
    setSaved(false)
    const variantWeights: PresetFormData['variantWeights'] = {}
    for (const [kind, variants] of Object.entries(weights)) {
      const entries = Object.entries(variants).filter(([, value]) => value.trim() !== '')
      if (entries.length === 0) continue
      variantWeights[kind] = Object.fromEntries(
        entries.map(([variant, value]) => [variant, Number(value)]),
      )
    }
    const data: PresetFormData = { ...form, preferredSections, variantWeights }
    startTransition(async () => {
      const result = await savePreset(initial.id, data)
      if ('error' in result) setError(result.error)
      else if (!initial.id) router.push(`/library/${result.id}`)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  const selectedPalette = options.palettes.find((p) => p.id === form.paletteId)

  const selectField = (
    key: keyof typeof form,
    label: string,
    values: { value: string; label: string }[],
  ) => (
    <div>
      <Label htmlFor={`pf-${key}`}>{label}</Label>
      <Select
        id={`pf-${key}`}
        className="mt-1 w-full"
        value={form[key]}
        onChange={(event) => set(key)(event.target.value)}
      >
        {values.map(({ value, label: optionLabel }) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pf-styleKey">Style key (slug)</Label>
          <Input
            id="pf-styleKey"
            className="mt-1 font-mono"
            value={form.styleKey}
            onChange={(event) => set('styleKey')(event.target.value)}
            placeholder="modern"
          />
        </div>
        <div>
          <Label htmlFor="pf-name">Name</Label>
          <Input
            id="pf-name"
            className="mt-1"
            value={form.name}
            onChange={(event) => set('name')(event.target.value)}
            placeholder="Modern — Plumbing"
          />
        </div>
        {selectField('trade', 'Trade', [
          { value: '', label: 'generic (any trade)' },
          ...options.trades.map((trade) => ({ value: trade, label: trade })),
        ])}
        {selectField(
          'templateId',
          'Template family',
          options.templateIds.map((id) => ({ value: id, label: id })),
        )}
        <div>
          {selectField(
            'paletteId',
            'Palette',
            options.palettes.map((palette) => ({ value: palette.id, label: palette.name })),
          )}
          {selectedPalette ? (
            <span className="mt-1.5 inline-flex overflow-hidden rounded border border-zinc-200">
              {selectedPalette.colors.map((color, i) => (
                <span key={i} className="h-4 w-8" style={{ backgroundColor: color }} />
              ))}
            </span>
          ) : null}
        </div>
        {selectField(
          'fontPairId',
          'Font pair',
          options.fontPairs.map((pair) => ({ value: pair.id, label: pair.name })),
        )}
        {selectField(
          'radius',
          'Radius',
          RADII.map((radius) => ({ value: radius, label: radius })),
        )}
        {selectField(
          'tone',
          'Tone',
          TONES.map((tone) => ({ value: tone, label: tone })),
        )}
        <div>
          <Label htmlFor="pf-imageryPool">Imagery pool</Label>
          <Input
            id="pf-imageryPool"
            className="mt-1 font-mono"
            value={form.imageryPool}
            onChange={(event) => set('imageryPool')(event.target.value)}
            placeholder="plumbing-modern"
          />
        </div>
        {selectField(
          'status',
          'Status',
          STATUSES.map((status) => ({ value: status, label: status })),
        )}
      </div>

      <div>
        <Label htmlFor="pf-description">Description</Label>
        <Textarea
          id="pf-description"
          className="mt-1"
          rows={2}
          value={form.description}
          onChange={(event) => set('description')(event.target.value)}
        />
      </div>

      <fieldset>
        <legend className="text-xs font-medium text-zinc-600">
          Preferred sections (none checked = generator default)
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {Object.keys(options.sectionVariants).map((kind) => (
            <label key={kind} className="flex items-center gap-1.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={preferredSections.includes(kind)}
                onChange={(event) => {
                  setSaved(false)
                  setPreferredSections((prev) =>
                    event.target.checked ? [...prev, kind] : prev.filter((k) => k !== kind),
                  )
                }}
              />
              {kind}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium text-zinc-600">
          Variant weights 0..1 — leave a whole row empty to allow all variants equally; 0 forbids a
          variant
        </legend>
        <div className="mt-2 space-y-2">
          {Object.entries(options.sectionVariants).map(([kind, variants]) => (
            <div key={kind} className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <span className="font-mono text-xs text-zinc-500">{kind}</span>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => (
                  <label key={variant} className="flex items-center gap-1 text-xs text-zinc-600">
                    {variant}
                    <Input
                      aria-label={`${kind} ${variant} weight`}
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-20 px-1.5 py-1 font-mono text-xs"
                      value={weights[kind]?.[variant] ?? ''}
                      onChange={(event) => {
                        setSaved(false)
                        setWeights((prev) => ({
                          ...prev,
                          [kind]: { ...prev[kind], [variant]: event.target.value },
                        }))
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600">Saved — sample render updated.</p> : null}
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : initial.id ? 'Save system' : 'Create system'}
        </Button>
        <Button onClick={() => router.push('/library')}>Back to library</Button>
      </div>
    </div>
  )
}
