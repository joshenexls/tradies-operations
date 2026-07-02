'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { clonePreset, setPresetStatus } from '@/server/actions/presets'
import { Button } from '@/components/ui/button'

export function CardActions({ presetId, status }: { presetId: string; status: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ ok: true; id: string } | { error: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) setError(result.error)
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await clonePreset(presetId)
              if ('error' in result) setError(result.error)
              else router.push(`/library/${result.id}`)
            })
          }
        >
          Clone
        </Button>
        {status === 'active' ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => setPresetStatus(presetId, 'retired'))}
          >
            Retire
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => setPresetStatus(presetId, 'active'))}
          >
            Activate
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
