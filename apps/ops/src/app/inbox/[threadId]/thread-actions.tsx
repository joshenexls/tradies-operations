'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeThread, sendReply, suppressAndCloseThread } from '@/server/actions/inbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardBody } from '@/components/ui/card'

export function ThreadActions({
  threadId,
  suppressed,
  claimUrl,
}: {
  threadId: string
  suppressed: boolean
  /** Absolute claim URL for the prospect's site — null hides the insert button. */
  claimUrl?: string | null
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ error: string } | { ok: true; messageId?: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) setError(result.error)
      else {
        setBody('')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        {suppressed ? (
          <p className="text-sm text-red-600">
            This prospect is suppressed — no further contact on any channel.
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`reply-${threadId}`}>Reply</Label>
              {claimUrl ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    setBody(
                      (current) =>
                        `${current}\n\nYou can claim your website and go live here: ${claimUrl}\n`,
                    )
                  }
                >
                  Insert claim link
                </Button>
              ) : null}
            </div>
            <Textarea
              id={`reply-${threadId}`}
              className="mt-1"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a reply…"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!suppressed ? (
            <Button
              variant="primary"
              disabled={pending || body.trim().length === 0}
              onClick={() => run(() => sendReply(threadId, body))}
            >
              Send reply
            </Button>
          ) : null}
          <Button disabled={pending} onClick={() => run(() => closeThread(threadId))}>
            Close
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(() => suppressAndCloseThread(threadId))}
          >
            Suppress &amp; close
          </Button>
          {pending ? <span className="text-xs text-zinc-500">Working…</span> : null}
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </CardBody>
    </Card>
  )
}
