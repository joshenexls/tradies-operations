import { expect, test } from '@playwright/test'
import { allProspectFixtures } from '@tradies/fixtures'

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
