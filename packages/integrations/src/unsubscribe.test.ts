import { describe, expect, it } from 'vitest'
import {
  buildUnsubscribeToken,
  resolveUnsubscribeSecret,
  verifyUnsubscribeToken,
} from './unsubscribe'

const PROSPECT_ID = '6f9619ff-8b86-4d11-b42d-00c04fc964ff'
const SECRET = 'test-secret'

describe('unsubscribe tokens', () => {
  it('round-trips a prospect id', () => {
    const token = buildUnsubscribeToken(PROSPECT_ID, SECRET)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) // url-safe, no percent-encoding needed
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(PROSPECT_ID)
  })

  it('is deterministic for the same id and secret', () => {
    expect(buildUnsubscribeToken(PROSPECT_ID, SECRET)).toBe(
      buildUnsubscribeToken(PROSPECT_ID, SECRET),
    )
  })

  it('rejects a tampered payload', () => {
    const token = buildUnsubscribeToken(PROSPECT_ID, SECRET)
    const otherId = Buffer.from('11111111-2222-3333-4444-555555555555').toString('base64url')
    const tampered = `${otherId}.${token.split('.')[1]}`
    expect(verifyUnsubscribeToken(tampered, SECRET)).toBeNull()
  })

  it('rejects a tampered signature and a wrong secret', () => {
    const token = buildUnsubscribeToken(PROSPECT_ID, SECRET)
    const [id, sig] = token.split('.') as [string, string]
    const flipped = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA')
    expect(verifyUnsubscribeToken(`${id}.${flipped}`, SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(token, 'another-secret')).toBeNull()
  })

  it('rejects garbage without throwing', () => {
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('no-dot-here', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('.', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('a.', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('!!.!!', SECRET)).toBeNull()
  })

  it('resolves the shared dev secret when the env is unset', () => {
    expect(resolveUnsubscribeSecret({} as NodeJS.ProcessEnv)).toBe('tradies-dev-unsubscribe-secret')
    expect(resolveUnsubscribeSecret({ UNSUBSCRIBE_SECRET: 's3cret' } as NodeJS.ProcessEnv)).toBe(
      's3cret',
    )
  })
})
