import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  right,
  className = '',
}: {
  title: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 ${className}`}
    >
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {right}
    </div>
  )
}

export function CardBody({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-4 py-3 ${className}`} {...props} />
}
