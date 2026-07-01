import { describe, expect, it } from 'vitest'
import type { OutreachChannel } from './channels'
import { ENTITY_TYPES, OUTREACH_CHANNELS } from './channels'

describe('OUTREACH_CHANNELS', () => {
  it('refuses to represent SMS at the type level', () => {
    // @ts-expect-error cold SMS to UK individual subscribers is unlawful under PECR
    const smsCold: OutreachChannel = 'sms_cold'
    // @ts-expect-error there is no SMS channel of any kind in this codebase
    const sms: OutreachChannel = 'sms'
    expect(smsCold).toBe('sms_cold')
    expect(sms).toBe('sms')
  })

  it('contains no SMS member at runtime', () => {
    for (const channel of OUTREACH_CHANNELS) {
      expect(channel.toLowerCase()).not.toContain('sms')
    }
  })

  it('represents exactly the three lawful channels', () => {
    expect(OUTREACH_CHANNELS).toEqual(['email_cold', 'email_solicited', 'postcard'])
  })
})

describe('ENTITY_TYPES', () => {
  it('models the three PECR subscriber states', () => {
    expect(ENTITY_TYPES).toEqual(['corporate', 'individual', 'unknown'])
  })
})
