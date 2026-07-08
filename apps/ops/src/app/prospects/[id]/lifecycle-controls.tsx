'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  disableSiteAction,
  publishSiteAction,
  unpublishSiteAction,
} from '@/server/actions/lifecycle'
import { Button } from '@/components/ui/button'

function shortToken(token: string): string {
  return token.length > 10 ? `${token.slice(0, 10)}…` : token
}

/**
 * Conversion controls for a prospect's site: copy the claim/portal links the
 * business receives, and the operator overrides on the go-live state machine.
 * Rendered inline in the prospect header, so everything here stays phrasing
 * content (spans + buttons).
 */
export function LifecycleControls({
  siteId,
  siteStatus,
  claimUrl,
  claimToken,
  portalUrl,
  portalToken,
}: {
  siteId: string
  siteStatus: string
  claimUrl: string | null
  claimToken: string | null
  portalUrl: string | null
  portalToken: string | null
}) {
  const router = useRouter()
  const [copied, setCopied] = useState<'claim' | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const copy = (kind: 'claim' | 'portal', url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500)
    })
  }

  const run = (action: () => Promise<{ ok: true } | { error: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      {claimUrl && claimToken ? (
        <Button onClick={() => copy('claim', claimUrl)} title={claimUrl}>
          {copied === 'claim' ? 'Copied ✓' : `Copy claim link (${shortToken(claimToken)})`}
        </Button>
      ) : null}
      {portalUrl && portalToken ? (
        <Button onClick={() => copy('portal', portalUrl)} title={portalUrl}>
          {copied === 'portal' ? 'Copied ✓' : `Copy portal link (${shortToken(portalToken)})`}
        </Button>
      ) : null}
      <Button
        variant="primary"
        disabled={pending || siteStatus === 'live'}
        onClick={() => run(() => publishSiteAction(siteId, 'operator publish from ops desk'))}
      >
        Publish
      </Button>
      <Button
        disabled={pending || siteStatus !== 'live'}
        onClick={() => run(() => unpublishSiteAction(siteId, 'operator unpublish from ops desk'))}
      >
        Unpublish
      </Button>
      <Button
        variant="danger"
        disabled={pending || siteStatus === 'disabled'}
        onClick={() => {
          if (
            confirm('Take this site fully offline? The tenant page will 404 until republished.')
          ) {
            run(() => disableSiteAction(siteId, 'operator disable from ops desk'))
          }
        }}
      >
        Disable
      </Button>
      {pending ? <span className="text-xs text-zinc-500">Working…</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
