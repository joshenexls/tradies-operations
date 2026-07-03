import { describe, expect, it } from 'vitest'
import { describeReadiness, type ReadinessReport } from './readiness'

const find = (r: ReadinessReport, name: string) => r.services.find((s) => s.name.startsWith(name))!

describe('describeReadiness', () => {
  it('an empty offline env reports every service as fixture, no critical warnings', () => {
    const r = describeReadiness({})
    expect(r.production).toBe(false)
    expect(r.db).toEqual({ configured: false, driver: 'pglite' })
    expect(r.services.every((s) => s.mode === 'fixture' || s.mode === 'dry-run')).toBe(true)
    expect(r.criticalWarnings).toEqual([])
    expect(r.services.some((s) => s.critical)).toBe(false)
  })

  it('a fully-keyed production env reports real modes and no critical warnings', () => {
    const r = describeReadiness({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      RESEND_API_KEY: 're_x',
      STRIPE_SECRET_KEY: 'sk_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      SMARTLEAD_API_KEY: 'sl_x',
      OUTREACH_DRY_RUN: '0',
      OPERATOR_COMPANY_NUMBER: '12345678',
      OPERATOR_REGISTERED_OFFICE: '1 Real St, Leeds',
      UNSUBSCRIBE_SECRET: 'realsecret',
      PREVIEW_VISIT_SALT: 'realsalt',
      OPS_AUTH_PASS: 'realpass',
      IMAGE_POOL_SOURCE: 'r2',
      POOL_BASE_URL: 'https://pools.example',
    })
    expect(r.production).toBe(true)
    expect(r.db.driver).toBe('postgres')
    expect(find(r, 'Email').mode).toBe('real')
    expect(find(r, 'Payments').mode).toBe('real')
    expect(find(r, 'Outreach').mode).toBe('real')
    expect(find(r, 'Imagery').mode).toBe('real')
    expect(r.criticalWarnings).toEqual([])
  })

  it('production with silent-fixture services raises exactly the dangerous criticals', () => {
    const r = describeReadiness({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })
    // email + stripe fixtures are critical in prod
    expect(find(r, 'Email').critical).toBe(true)
    expect(find(r, 'Payments').critical).toBe(true)
    // outreach (fixture or dry-run) is never critical
    expect(find(r, 'Outreach').critical).toBe(false)
    expect(r.criticalWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Email is in FIXTURE mode'),
        expect.stringContaining('Stripe is in FIXTURE mode'),
        expect.stringContaining('UNSUBSCRIBE_SECRET is unset'),
        expect.stringContaining('OPS_AUTH_PASS is unset'),
      ]),
    )
  })

  it('flags a live Stripe key with a missing webhook secret (the silent-500 trap)', () => {
    const r = describeReadiness({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      STRIPE_SECRET_KEY: 'sk_x',
    })
    expect(find(r, 'Payments').mode).toBe('real')
    expect(find(r, 'Payments').critical).toBe(true)
    expect(r.criticalWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('STRIPE_WEBHOOK_SECRET is unset')]),
    )
  })

  it('legal identity is only critical when actually sending cold email', () => {
    const dry = describeReadiness({ NODE_ENV: 'production', SMARTLEAD_API_KEY: 'x' }) // dry-run default
    expect(find(dry, 'Operator legal identity').critical).toBe(false)
    const live = describeReadiness({
      NODE_ENV: 'production',
      SMARTLEAD_API_KEY: 'x',
      OUTREACH_DRY_RUN: '0',
    })
    expect(find(live, 'Operator legal identity').critical).toBe(true)
    expect(live.criticalWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('placeholder company number')]),
    )
  })

  it('dev never marks anything critical, even with everything unset', () => {
    const r = describeReadiness({ NODE_ENV: 'development' })
    expect(r.services.some((s) => s.critical)).toBe(false)
    expect(r.criticalWarnings).toEqual([])
  })
})
