import { describe, expect, it } from 'vitest'
import { MissingEnvError, optional, parseEnv, required } from './env'

describe('parseEnv', () => {
  it('parses present keys', () => {
    const env = parseEnv({ FOO: { schema: required, phase: 2 } }, { FOO: 'bar' })
    expect(env.FOO).toBe('bar')
  })

  it('fails fast naming the phase and hint for missing keys', () => {
    try {
      parseEnv(
        {
          ANTHROPIC_API_KEY: { schema: required, phase: 2, hint: 'Anthropic Console' },
          DATABASE_URL: { schema: required, phase: 2 },
        },
        {},
      )
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MissingEnvError)
      const message = (err as MissingEnvError).message
      expect(message).toContain('ANTHROPIC_API_KEY')
      expect(message).toContain('Phase 2')
      expect(message).toContain('Anthropic Console')
      expect(message).toContain('DATABASE_URL')
    }
  })

  it('treats optional keys as absent, not errors', () => {
    const env = parseEnv({ LANGFUSE_PUBLIC_KEY: { schema: optional, phase: 2 } }, {})
    expect(env.LANGFUSE_PUBLIC_KEY).toBeUndefined()
  })

  it('rejects empty strings for required keys', () => {
    expect(() => parseEnv({ FOO: { schema: required, phase: 1 } }, { FOO: '' })).toThrow(
      MissingEnvError,
    )
  })
})
