/** micro-GBP → display £. Sub-penny amounts keep 4 decimals so LLM costs stay visible. */
export function formatMicroGbp(micro: number): string {
  const pounds = micro / 1_000_000
  const decimals = micro !== 0 && Math.abs(pounds) < 0.01 ? 4 : 2
  return `£${pounds.toFixed(decimals)}`
}

export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function relativeTime(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}
