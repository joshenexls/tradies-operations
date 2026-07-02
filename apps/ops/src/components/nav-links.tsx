'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/review', label: 'Review batches' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/library', label: 'Library' },
] as const

export function NavLinks({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              active ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {label}
            {href === '/inbox' && inboxCount > 0 ? (
              <span
                data-testid="inbox-unread-badge"
                className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white"
              >
                {inboxCount}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
