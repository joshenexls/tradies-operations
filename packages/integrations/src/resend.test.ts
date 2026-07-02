import { describe, expect, it } from 'vitest'
import { FixtureResendMailer, RealResendMailer, ResendError, parseResendInbound } from './resend'
import type { FetchLike } from './types'

describe('FixtureResendMailer', () => {
  it('records sends and returns deterministic provider ids', async () => {
    const mailer = new FixtureResendMailer()
    const first = await mailer.send({
      from: 'Tradies Studio <studio@mail.example>',
      to: 'info@swiftflowplumbing.example',
      subject: 'Re: Your new site',
      text: 'Thanks for getting back to us!',
    })
    expect(first.providerId).toBe('re-msg-1')
    const second = await mailer.send({
      from: 'Tradies Studio <studio@mail.example>',
      to: 'other@b.example',
      subject: 's',
      text: 'b',
    })
    expect(second.providerId).toBe('re-msg-2')
    expect(mailer.sends).toHaveLength(2)
    expect(mailer.sends[0]?.to).toBe('info@swiftflowplumbing.example')
  })
})

describe('RealResendMailer', () => {
  it('POSTs to /emails with a bearer key and the documented body shape', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ id: 're_abc123' }), { status: 200 })
    }
    const mailer = new RealResendMailer({ apiKey: 're-key', fetchImpl })
    const result = await mailer.send({
      from: 'Tradies Studio <studio@mail.example>',
      to: 'info@swiftflowplumbing.example',
      subject: 'Re: Your new site',
      text: 'plain body',
      headers: { 'In-Reply-To': '<abc@mail.example>' },
    })
    expect(result.providerId).toBe('re_abc123')
    expect(calls[0]?.url).toBe('https://api.resend.com/emails')
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe('Bearer re-key')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      from: 'Tradies Studio <studio@mail.example>',
      to: ['info@swiftflowplumbing.example'],
      subject: 'Re: Your new site',
      text: 'plain body',
      headers: { 'In-Reply-To': '<abc@mail.example>' },
    })
  })

  it('throws a typed ResendError with the status on non-2xx', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 })
    const mailer = new RealResendMailer({ apiKey: 'bad', fetchImpl })
    const promise = mailer.send({ from: 'a@b.example', to: 'c@d.example', subject: 's', text: 'b' })
    await expect(promise).rejects.toBeInstanceOf(ResendError)
    await expect(promise).rejects.toMatchObject({ status: 401 })
  })
})

describe('parseResendInbound', () => {
  // recorded-shape fixture: Resend inbound webhook envelope
  const recordedInbound = {
    type: 'email.received',
    created_at: '2026-06-01T09:30:00.000Z',
    data: {
      from: 'Sam Waters <sam@swiftflowplumbing.example>',
      to: ['replies+prospect-6f9619ff-8b86-4d11-b42d-00c04fc964ff@inbound.mail.example'],
      subject: 'Re: A new website for Swift Flow Plumbing',
      text: 'This looks great — how do I claim it?',
      html: '<p>This looks great — how do I claim it?</p>',
    },
  }

  it('extracts the prospect plus-token and the message fields', () => {
    expect(parseResendInbound(recordedInbound)).toEqual({
      toPlusToken: 'prospect-6f9619ff-8b86-4d11-b42d-00c04fc964ff',
      from: 'Sam Waters <sam@swiftflowplumbing.example>',
      subject: 'Re: A new website for Swift Flow Plumbing',
      text: 'This looks great — how do I claim it?',
      html: '<p>This looks great — how do I claim it?</p>',
    })
  })

  it('returns a null token when the to-address has no prospect plus-token', () => {
    const parsed = parseResendInbound({
      data: {
        from: 'someone@example.com',
        to: ['replies@inbound.mail.example'],
        subject: 'hi',
        text: 'hello',
      },
    })
    expect(parsed?.toPlusToken).toBeNull()
    expect(parsed?.from).toBe('someone@example.com')
  })

  it('tolerates an unwrapped payload and a string to-address', () => {
    const parsed = parseResendInbound({
      from: 'a@b.example',
      to: 'replies+prospect-6f9619ff-8b86-4d11-b42d-00c04fc964ff@inbound.mail.example',
      subject: 's',
      text: 't',
    })
    expect(parsed?.toPlusToken).toBe('prospect-6f9619ff-8b86-4d11-b42d-00c04fc964ff')
  })

  it('returns null for payloads that are not inbound emails', () => {
    expect(parseResendInbound(null)).toBeNull()
    expect(parseResendInbound('email.received')).toBeNull()
    expect(parseResendInbound({ type: 'email.received', data: {} })).toBeNull()
    expect(parseResendInbound({ data: { from: 'a@b.example' } })).toBeNull()
  })
})
