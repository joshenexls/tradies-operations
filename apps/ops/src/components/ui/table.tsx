import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'

export function TableShell({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  )
}

export function Table({ className = '', ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={`w-full text-left text-sm ${className}`} {...props} />
}

export function Th({ className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 ${className}`}
      {...props}
    />
  )
}

export function Td({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`whitespace-nowrap border-b border-zinc-100 px-3 py-2 align-middle text-zinc-700 ${className}`}
      {...props}
    />
  )
}
