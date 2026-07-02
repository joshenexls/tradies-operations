'use client'

import { useState } from 'react'

/** Preview iframe with a mobile/desktop width toggle. */
export function PreviewFrame({ src, title }: { src: string; title: string }) {
  const [width, setWidth] = useState<'mobile' | 'desktop'>('desktop')
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(['mobile', 'desktop'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setWidth(mode)}
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              width === mode
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {mode === 'mobile' ? 'Mobile 375' : 'Desktop'}
          </button>
        ))}
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
        >
          Open in new tab ↗
        </a>
      </div>
      <div className="flex justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
        <iframe
          src={src}
          title={title}
          loading="lazy"
          className="h-[640px] bg-white"
          style={{ width: width === 'mobile' ? 375 : '100%' }}
        />
      </div>
    </div>
  )
}
