'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { declineEditRequestAction, regenerateFromEditRequest } from '@/server/actions/edits'
import { Button } from '@/components/ui/button'

export function EditActions({ editRequestId }: { editRequestId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ error: string } | { ok: true; version?: number }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() => run(() => regenerateFromEditRequest(editRequestId))}
      >
        {pending ? 'Regenerating…' : 'Regenerate with this feedback'}
      </Button>
      <Button
        disabled={pending}
        onClick={() => {
          if (confirm('Decline this edit request? The requester will not get a new version.')) {
            run(() => declineEditRequestAction(editRequestId))
          }
        }}
      >
        Decline
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
