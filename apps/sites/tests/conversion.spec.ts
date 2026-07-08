import { expect, test } from '@playwright/test'
import { allProspectFixtures } from '@tradies/fixtures'

/**
 * The full offline conversion chain against fixture providers: a preview
 * becomes a paying customer's live site with a working portal and lead
 * alerts, with zero external keys. The synthetic webhook POST is byte-shaped
 * like Stripe's real event envelope — exactly what production receives.
 */

const fixture = allProspectFixtures[0]! // leeds-plumber-swift
const TENANT = `http://${fixture.key}.localhost:3102`

test.describe.configure({ mode: 'serial' })

let claimToken: string

test('preview carries noindex + claim banner, and the claim page renders the offer', async ({
  page,
}) => {
  const response = await page.goto(`${TENANT}/`)
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-robots-tag']).toContain('noindex')
  await expect(page.getByText(/not the official website/i)).toBeVisible()

  const claimHref = await page
    .getByRole('link', { name: /claim this website/i })
    .getAttribute('href')
  expect(claimHref).toMatch(/^\/claim\//)
  claimToken = claimHref!.split('/')[2]!

  // claim page passes through un-rewritten on the tenant host, still noindex
  const claimResponse = await page.goto(`${TENANT}${claimHref}`)
  expect(claimResponse?.status()).toBe(200)
  expect(claimResponse?.headers()['x-robots-tag']).toContain('noindex')
  await expect(page.getByTestId('price-block')).toContainText('/month')
  await expect(page.getByTestId('price-block')).toContainText(/waived/i)
})

test('claim form → fixture checkout → webhook → live site', async ({ page, request }) => {
  await page.goto(`${TENANT}/claim/${claimToken}`)
  await page.getByLabel(/email/i).fill('owner@conversiontest.example')
  await page.getByLabel(/your name/i).fill('Test Owner')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /continue to secure checkout/i }).click()

  // FixtureStripeClient returns url = successUrl → we land on "finalising"
  await expect(page).toHaveURL(new RegExp(`/claim/${claimToken}/success`))
  await expect(page.getByTestId('finalising')).toBeVisible()

  // Stripe's webhook, byte-shaped like the real envelope
  const webhook = await request.post(`http://localhost:3102/api/webhooks/stripe`, {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({
      id: 'evt_e2e_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_e2e_1',
          customer: 'cus_e2e_1',
          subscription: 'sub_e2e_1',
          metadata: { claimToken },
        },
      },
    }),
  })
  expect(webhook.status()).toBe(200)
  expect(await webhook.json()).toMatchObject({ ok: true, handled: 'checkout.session.completed' })

  // replaying the exact event is a 200 no-op (idempotency unit-tested; here we
  // just prove the endpoint stays calm)
  const replay = await request.post(`http://localhost:3102/api/webhooks/stripe`, {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({
      id: 'evt_e2e_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_e2e_1',
          customer: 'cus_e2e_1',
          subscription: 'sub_e2e_1',
          metadata: { claimToken },
        },
      },
    }),
  })
  expect(replay.status()).toBe(200)

  // malformed body → 400, nothing changes
  const garbage = await request.post(`http://localhost:3102/api/webhooks/stripe`, {
    headers: { 'content-type': 'application/json' },
    data: 'not json at all',
  })
  expect(garbage.status()).toBe(400)

  await page.goto(`${TENANT}/claim/${claimToken}/success`)
  await expect(page.getByText(/your website is live/i)).toBeVisible()
  await expect(page.getByTestId('portal-link')).toBeVisible()
})

let portalPath: string

test('live site: no noindex header, no preview banner, chatbot un-demoed', async ({ page }) => {
  const success = await page.goto(`${TENANT}/claim/${claimToken}/success`)
  expect(success?.status()).toBe(200)
  portalPath = (await page.getByTestId('portal-link').getAttribute('href'))!

  const response = await page.goto(`${TENANT}/`)
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-robots-tag']).toBeUndefined()
  await expect(page.getByText(/not the official website/i)).toHaveCount(0)
  // widget present and NOT demo-labelled
  const embed = page.locator('script[src="/embed/v1.js"]')
  await expect(embed).toHaveAttribute('data-demo', 'false')
})

test('portal: edit request, chatbot toggle off, lead captured with email alert', async ({
  page,
}) => {
  await page.goto(`${TENANT}${portalPath}`)
  await expect(page.getByText(fixture.businessName)).toBeVisible()

  // request a change
  await page
    .getByLabel(/request a change|what should we change/i)
    .fill('Please swap the hero photo for one of our own van.')
  await page
    .getByRole('button', { name: /request|send change/i })
    .first()
    .click()
  await expect(page.getByText(/swap the hero photo/i)).toBeVisible()

  // toggle the chatbot off (onChange fires a server action — poll until it
  // has persisted rather than racing the reload)
  await page.getByRole('checkbox', { name: /chat/i }).uncheck()
  await expect
    .poll(
      async () => {
        await page.reload()
        return page.getByRole('checkbox', { name: /chat/i }).isChecked()
      },
      { timeout: 10_000 },
    )
    .toBe(false)

  // widget disappears from the live site
  await page.goto(`${TENANT}/`)
  await expect(page.locator('script[src="/embed/v1.js"]')).toHaveCount(0)

  // a visitor submits the lead form on the live site
  await page.getByLabel(/name/i).first().fill('Converting Customer')
  await page.getByLabel(/phone/i).first().fill('07700 900123')
  await page
    .getByLabel(/how can we help|message/i)
    .first()
    .fill('Need a quote for a bathroom refit.')
  await page
    .getByRole('button', { name: /send|get|quote|request/i })
    .first()
    .click()
  await expect(page).toHaveURL(/sent=1/)

  // the portal shows the lead, alerted by email (after() runs post-response —
  // poll briefly)
  await expect
    .poll(
      async () => {
        await page.goto(`${TENANT}${portalPath}`)
        const row = page.getByText('Converting Customer')
        if ((await row.count()) === 0) return 'no-lead'
        return (await page.getByTestId('lead-alerted').count()) > 0 ? 'alerted' : 'not-alerted'
      },
      { timeout: 15_000 },
    )
    .toBe('alerted')
})
