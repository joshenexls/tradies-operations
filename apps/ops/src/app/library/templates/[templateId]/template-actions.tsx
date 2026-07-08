'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { activateTemplate, reingestTemplate, retireTemplate } from '@/server/actions/templates'
import type { ReingestTemplateResult, TemplateActionResult } from '@/server/core/templates'
import { Button } from '@/components/ui/button'

export function TemplateActions({ templateId, status }: { templateId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (
    confirmText: string,
    action: () => Promise<TemplateActionResult | ReingestTemplateResult>,
  ) => {
    if (!window.confirm(confirmText)) return
    setError(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) setError(result.error)
      else if (!result.ok) setError(result.message)
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {status !== 'active' ? (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              run('Activate this design system? Generation can select it immediately.', () =>
                activateTemplate(templateId),
              )
            }
          >
            Activate
          </Button>
        ) : null}
        <Button
          disabled={pending}
          onClick={() =>
            run(
              'Re-run sanitize + annotate on the stored upload? An active system that fails validation flips back to draft.',
              () => reingestTemplate(templateId),
            )
          }
        >
          Re-ingest
        </Button>
        {status !== 'retired' ? (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              run('Retire this design system and its presets?', () => retireTemplate(templateId))
            }
          >
            Retire
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
