import { customAlphabet } from 'nanoid'

const shortId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

/** Unguessable preview slug: name-derived prefix + 8-char suffix. */
export function makeSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'site'}-${shortId()}`
}

export function makeToken(prefix: 'claim' | 'portal'): string {
  return `${prefix}-${shortId()}${shortId()}`
}
