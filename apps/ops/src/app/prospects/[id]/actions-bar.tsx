'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateForProspect } from '@/server/actions/generation'
import { eraseProspect, suppressProspect } from '@/server/actions/prospects'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export type PresetOption = { id: string; name: string; trade: string | null }

export function ActionsBar({
  prospectId,
  presets,
  currentPresetId,
}: {
  prospectId: string
  presets: PresetOption[]
  currentPresetId: string | null
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<'regenerate' | 'suppress' | 'erase' | null>(null)
  const [feedback, setFeedback] = useState('')
  const [presetId, setPresetId] = useState(currentPresetId ?? presets[0]?.id ?? '')
  const [confirmErase, setConfirmErase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const close = () => {
    setDialog(null)
    setError(null)
    setConfirmErase(false)
  }

  const runRegenerate = () => {
    setError(null)
    startTransition(async () => {
      const result = await generateForProspect(prospectId, {
        presetId: presetId || undefined,
        feedback: feedback.trim() || undefined,
      })
      if ('error' in result) setError(result.error)
      else {
        setFeedback('')
        close()
      }
    })
  }

  const runSuppress = () => {
    setError(null)
    startTransition(async () => {
      const result = await suppressProspect(prospectId)
      if ('error' in result) setError(result.error)
      else close()
    })
  }

  const runErase = () => {
    setError(null)
    startTransition(async () => {
      const result = await eraseProspect(prospectId)
      if ('error' in result) setError(result.error)
      else router.push('/pipeline')
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" onClick={() => setDialog('regenerate')}>
        Regenerate
      </Button>
      <Button onClick={() => setDialog('suppress')}>Suppress</Button>
      <Button variant="danger" onClick={() => setDialog('erase')}>
        Delete on request
      </Button>

      <Dialog open={dialog === 'regenerate'} onClose={close} title="Regenerate site">
        <div className="space-y-3">
          <div>
            <Label htmlFor="regen-feedback">Feedback for the generator</Label>
            <Textarea
              id="regen-feedback"
              className="mt-1"
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="e.g. shorter headline"
            />
          </div>
          <div>
            <Label htmlFor="regen-style">Design system</Label>
            <Select
              id="regen-style"
              className="mt-1 w-full"
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} {preset.trade ? `[${preset.trade}]` : '[generic]'}
                  {preset.id === currentPresetId ? ' — current' : ''}
                </option>
              ))}
            </Select>
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={runRegenerate} disabled={pending}>
              {pending ? 'Generating…' : 'Generate new version'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === 'suppress'} onClose={close} title="Suppress prospect">
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Adds every known identifier (email, phone, place id) to the global suppression list and
            marks the prospect suppressed. An opt-out anywhere suppresses everywhere — no channel
            will ever contact them again.
          </p>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button variant="danger" onClick={runSuppress} disabled={pending}>
              {pending ? 'Suppressing…' : 'Suppress'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === 'erase'} onClose={close} title="Delete on request (GDPR erasure)">
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            This is the right-to-erasure path: identifiers go on the suppression list (so we never
            contact them again — that retention is lawful), then all PII is stripped: business name,
            phone, address, extracted profile and every stored site spec are removed, and the
            preview site is disabled. This cannot be undone.
          </p>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="mt-0.5 accent-red-600"
              checked={confirmErase}
              onChange={(event) => setConfirmErase(event.target.checked)}
            />
            I confirm the business asked for erasure and I understand this is permanent.
          </label>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button variant="danger" onClick={runErase} disabled={pending || !confirmErase}>
              {pending ? 'Erasing…' : 'Erase permanently'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
