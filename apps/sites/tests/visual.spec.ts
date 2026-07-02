import { expect, test } from '@playwright/test'
import { allDesignTemplateFixtures, allProspectFixtures } from '@tradies/fixtures'

/**
 * Every seeded fixture site (slug = fixture key, seeded by scripts/seed.ts
 * via the playwright webServer command) is screenshotted at three viewports.
 * This is the "does the engine produce genuinely good-looking pages" gate —
 * review the baselines by eye whenever they change.
 */

const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 780 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

for (const fixture of allProspectFixtures) {
  test.describe(fixture.key, () => {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        const response = await page.goto(`http://${fixture.key}.localhost:3100/`)
        expect(response?.status()).toBe(200)
        expect(response?.headers()['x-robots-tag']).toContain('noindex')
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveScreenshot(`${fixture.key}-${viewport.name}.png`, {
          fullPage: true,
        })
      })
    }
  })
}

// The uploaded-HTML render path: one demo tenant per shipped design system
// (slug = design-{key}, seeded by scripts/seed.ts with fixture content).
for (const design of allDesignTemplateFixtures) {
  test.describe(`design-${design.key}`, () => {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        const response = await page.goto(`http://design-${design.key}.localhost:3100/`)
        expect(response?.status()).toBe(200)
        expect(response?.headers()['x-robots-tag']).toContain('noindex')
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveScreenshot(`design-${design.key}-${viewport.name}.png`, {
          fullPage: true,
        })
      })
    }
  })
}

test('html design-system sites are sanitized: no external scripts, no testimonials, no ratings', async ({
  page,
}) => {
  await page.goto('http://design-craftsman-dark.localhost:3100/')
  await expect(page.getByText(/not the official website/i)).toBeVisible()
  // the sanitizer stripped the lander's analytics <script src> and beacon;
  // nothing may reintroduce a THIRD-PARTY script at render time (Next's own
  // same-origin runtime chunks are expected)
  const scriptSrcs = await page
    .locator('script[src]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src') ?? ''))
  const offsite = scriptSrcs.filter(
    (src) => /^(https?:)?\/\//i.test(src) && !src.includes('localhost:3100'),
  )
  expect(offsite).toEqual([])
  const body = (await page.textContent('body')) ?? ''
  expect(body.toLowerCase()).not.toContain('testimonial')
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent()
  expect(jsonLd).toBeTruthy()
  expect(jsonLd).not.toContain('aggregateRating')
})

test('html design-system lead form submits into the shared pipeline', async ({ page }) => {
  await page.goto('http://design-craftsman-dark.localhost:3100/')
  await page.getByLabel(/name/i).first().fill('Playwright Html Test')
  await page.getByLabel(/phone/i).first().fill('07700 900998')
  // the FAQ accordion uses type="button" — only the lead form submits
  await page.locator('button[type="submit"]').first().click()
  await expect(page).toHaveURL(/sent=1/)
})

test('preview banner names the operator and disclaims officialness', async ({ page }) => {
  const first = allProspectFixtures[0]!
  await page.goto(`http://${first.key}.localhost:3100/`)
  const banner = page.getByText(/not the official website/i)
  await expect(banner).toBeVisible()
})

test('lead form submits and records', async ({ page }) => {
  const first = allProspectFixtures[0]!
  await page.goto(`http://${first.key}.localhost:3100/`)
  await page.getByLabel(/name/i).first().fill('Playwright Test')
  await page.getByLabel(/phone/i).first().fill('07700 900999')
  await page
    .getByLabel(/how can we help|message/i)
    .first()
    .fill('Testing the lead form end to end.')
  await page
    .getByRole('button', { name: /send|get|quote|request/i })
    .first()
    .click()
  await expect(page).toHaveURL(/sent=1/)
})
