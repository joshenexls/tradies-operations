import { describe, expect, it } from 'vitest'
import { extractTenantSlug } from './tenancy'

const prod = { previewBaseHost: 'app.tradies.co.uk' }
const dev = { previewBaseHost: 'localhost' }

describe('extractTenantSlug', () => {
  it('extracts the slug from a preview subdomain', () => {
    expect(extractTenantSlug('smith-plumbing-a1b2c3.app.tradies.co.uk', prod)).toBe(
      'smith-plumbing-a1b2c3',
    )
  })

  it('extracts dev slugs with ports', () => {
    expect(extractTenantSlug('smith-plumbing.localhost:3000', dev)).toBe('smith-plumbing')
  })

  it('returns null for the bare base host', () => {
    expect(extractTenantSlug('app.tradies.co.uk', prod)).toBeNull()
    expect(extractTenantSlug('localhost:3000', dev)).toBeNull()
  })

  it('returns null for unrelated hosts', () => {
    expect(extractTenantSlug('tradies.co.uk', prod)).toBeNull()
    expect(extractTenantSlug('evil.example.com', prod)).toBeNull()
    expect(extractTenantSlug('app.tradies.co.uk.evil.example.com', prod)).toBeNull()
  })

  it('rejects nested subdomains and reserved names', () => {
    expect(extractTenantSlug('a.b.app.tradies.co.uk', prod)).toBeNull()
    expect(extractTenantSlug('www.app.tradies.co.uk', prod)).toBeNull()
    expect(extractTenantSlug('api.app.tradies.co.uk', prod)).toBeNull()
  })

  it('rejects malformed slugs', () => {
    expect(extractTenantSlug('-bad.app.tradies.co.uk', prod)).toBeNull()
    expect(extractTenantSlug('UPPER_case!.app.tradies.co.uk', prod)).toBeNull()
  })

  it('is case-insensitive on the host', () => {
    expect(extractTenantSlug('Smith-Plumbing.APP.tradies.CO.UK', prod)).toBe('smith-plumbing')
  })
})
