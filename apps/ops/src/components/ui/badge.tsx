import type { ReactNode } from 'react'

const TONES = {
  grey: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
} as const

export type BadgeTone = keyof typeof TONES

export function Badge({
  tone = 'grey',
  children,
  className = '',
  ...props
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

export function entityTone(entityType: string): BadgeTone {
  if (entityType === 'corporate') return 'green'
  if (entityType === 'individual') return 'amber'
  return 'grey'
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'approved':
    case 'converted':
    case 'claimed':
      return 'green'
    case 'in_review':
    case 'generating':
      return 'indigo'
    case 'contacted':
    case 'replied':
    case 'outreach_queued':
      return 'blue'
    case 'rejected':
    case 'suppressed':
      return 'red'
    case 'expired':
      return 'amber'
    default:
      return 'grey'
  }
}

export function segmentTone(segment: string | null): BadgeTone {
  if (segment === 'no_site') return 'indigo'
  if (segment === 'bad_site') return 'amber'
  if (segment === 'fine') return 'grey'
  return 'grey'
}
