import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Nav } from '@/components/nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ops desk — Tradies',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-screen-2xl items-center gap-8 px-4">
            <span className="text-sm font-bold tracking-tight text-zinc-900">
              tradies<span className="text-indigo-600">/ops</span>
            </span>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-screen-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
