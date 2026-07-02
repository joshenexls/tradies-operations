'use client'

import { useState, useTransition } from 'react'
import { decideReview } from '@/server/actions/reviews'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export type PresetOption = { id: string; name: string; trade: string | null }

export function DecisionForm({
  requestId,
  presets,
  currentPresetId,
}: {
  requestId: string
  presets: PresetOption[]
  currentPresetId: string | null
}) {
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [presetId, setPresetId] = useState(currentPresetId ?? presets[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const decide = (
    decision: 'approved' | 'rejected' | 'regenerate',
    opts?: { feedback?: string; stylePresetOverride?: string },
  ) => {
    setError(null)
    startTransition(async () => {
      const result = await decideReview(requestId, decision, opts)
      if ('error' in result) setError(result.error)
      else {
        setShowRegenerate(false)
        setFeedback('')
      }
    })
  }

  return (
    <div className="space-y-3 border-t border-zinc-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={pending} onClick={() => decide('approved')}>
          Approve
        </Button>
        <Button variant="danger" disabled={pending} onClick={() => decide('rejected')}>
          Reject
        </Button>
        <Button disabled={pending} onClick={() => setShowRegenerate((v) => !v)}>
          Regenerate…
        </Button>
        {pending ? <span className="text-xs text-zinc-500">Working…</span> : null}
      </div>
      {showRegenerate ? (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div>
            <Label htmlFor={`feedback-${requestId}`}>Feedback (required)</Label>
            <Textarea
              id={`feedback-${requestId}`}
              className="mt-1"
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="e.g. shorter headline, different hero image"
            />
          </div>
          <div>
            <Label htmlFor={`style-${requestId}`}>Style direction</Label>
            <Select
              id={`style-${requestId}`}
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
          <Button
            variant="primary"
            disabled={pending || feedback.trim().length === 0}
            onClick={() => decide('regenerate', { feedback, stylePresetOverride: presetId })}
          >
            Regenerate version
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
