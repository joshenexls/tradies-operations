'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/review', label: 'Review batches' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/customers', label: 'Customers' },
  { href: '/edits', label: 'Edits' },
  { href: '/library', label: 'Library' },
] as const

export function NavLinks({ inboxCount, editsCount }: { inboxCount: number; editsCount: number }) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        const badge =
          href === '/inbox' && inboxCount > 0
            ? { testId: 'inbox-unread-badge', count: inboxCount }
            : href === '/edits' && editsCount > 0
              ? { testId: 'edits-new-badge', count: editsCount }
              : null
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              active ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {label}
            {badge ? (
              <span
                data-testid={badge.testId}
                className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white"
              >
                {badge.count}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
