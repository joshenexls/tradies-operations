/**
 * Hostname → tenant slug resolution. The hostname is the single tenant key:
 * {slug}.app.tradies.co.uk in production, {slug}.localhost in dev. Custom
 * customer domains resolve via DB lookup (Phase 6) — not here.
 */

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'outreach', 'reply', 'mail', 'api'])

export type TenancyConfig = {
  /** Base host previews hang off, e.g. 'app.tradies.co.uk' or 'localhost'. */
  previewBaseHost: string
}

export function extractTenantSlug(hostHeader: string | null, config: TenancyConfig): string | null {
  if (!hostHeader) return null
  const host = hostHeader.split(':')[0]?.toLowerCase().trim()
  if (!host) return null
  const base = config.previewBaseHost.toLowerCase()
  if (host === base) return null
  if (!host.endsWith(`.${base}`)) return null
  const sub = host.slice(0, -(base.length + 1))
  // only single-level subdomains are tenants
  if (sub.includes('.')) return null
  if (RESERVED_SUBDOMAINS.has(sub)) return null
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(sub)) return null
  return sub
}

export function previewUrlForSlug(slug: string, config: TenancyConfig, port?: string): string {
  const isLocal = config.previewBaseHost === 'localhost'
  const proto = isLocal ? 'http' : 'https'
  const portSuffix = isLocal && port ? `:${port}` : ''
  return `${proto}://${slug}.${config.previewBaseHost}${portSuffix}`
}
