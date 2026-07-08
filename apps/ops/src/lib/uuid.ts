const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Guard route params before they reach a uuid column (bad input → 404, not a DB error). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
