'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { regeneratePitch } from '@/server/actions/pitches'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type PitchView = { version: number; subject: string; body: string }

/**
 * The outreach pitch alongside the site preview, so one review decision
 * covers everything the prospect will see. The stored body has no legal
 * footer — dispatch appends it at queue time.
 */
export function PitchPanel({ prospectId, pitch }: { prospectId: string; pitch: PitchView | null }) {
  const router = useRouter()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = () => {
    setError(null)
    startTransition(async () => {
      const result = await regeneratePitch(prospectId, {
        feedback: feedback.trim() || undefined,
      })
      if ('error' in result) setError(result.error)
      else {
        setFeedback('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3" data-testid="pitch-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pitch email</h3>
        {pitch ? <span className="font-mono text-xs text-zinc-400">v{pitch.version}</span> : null}
      </div>

      {pitch ? (
        <div className="space-y-2">
          <p data-testid="pitch-subject" className="text-sm font-medium text-zinc-900">
            {pitch.subject}
          </p>
          <p
            data-testid="pitch-body"
            className="whitespace-pre-wrap rounded-md bg-zinc-50 p-2.5 text-sm text-zinc-700"
          >
            {pitch.body}
          </p>
          <p className="text-[11px] text-zinc-400">
            The legal footer (identity, price, unsubscribe link) is appended at send time.
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">No pitch yet — generate one for this prospect.</p>
      )}

      <div className="space-y-2">
        {pitch ? (
          <div>
            <Label htmlFor={`pitch-feedback-${prospectId}`}>Feedback (optional)</Label>
            <Textarea
              id={`pitch-feedback-${prospectId}`}
              className="mt-1"
              rows={2}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="e.g. lead with the emergency call-outs"
            />
          </div>
        ) : null}
        <Button disabled={pending} onClick={run}>
          {pending ? 'Working…' : pitch ? 'Regenerate pitch' : 'Generate pitch'}
        </Button>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </div>
  )
}
