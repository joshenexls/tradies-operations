import { expect, test } from '@playwright/test'

/**
 * Smoke pass over the four ops screens against the seeded fixture DB
 * (20 prospects, 6 component + 3 html seed design systems, one 'Fixture
 * batch' of 5 pending site reviews). Serial: the approve/classify tests
 * mutate shared state.
 */

test.describe.configure({ mode: 'serial' })

test('pipeline lists the 20 fixture prospects and the trade filter narrows them', async ({
  page,
}) => {
  await page.goto('/pipeline')
  await expect(page.getByTestId('pipeline-row')).toHaveCount(20)

  await page.getByLabel('Trade').selectOption('plumber')
  await expect(page).toHaveURL(/trade=plumber/)
  // exactly 4 plumber fixtures
  await expect(page.getByTestId('pipeline-row')).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Swift Flow Plumbing' })).toBeVisible()
})

test('library shows the 9 seed systems grouped and renders a live sample', async ({ page }) => {
  await page.goto('/library')
  // 6 component presets + 3 seeded html design systems
  await expect(page.getByTestId('preset-card')).toHaveCount(9)

  await page.getByRole('link', { name: 'Edit Modern — Plumbing' }).click()
  // default sample fixture is the first plumber (Swift Flow Plumbing) and the
  // deterministic FixtureLLM always grounds the hero headline in its name
  await expect(page.getByTestId('sample-render').locator('h1')).toContainText('Swift Flow Plumbing')
})

test('review batch shows pending cards and approving flips request + prospect', async ({
  page,
}) => {
  await page.goto('/review')
  await page.getByRole('link', { name: 'Fixture batch' }).click()
  await expect(page.getByTestId('review-card')).toHaveCount(5)
  await expect(page.getByTestId('batch-progress')).toContainText('0/5 decided')

  const first = page.getByTestId('review-card').first()
  const name = (await first.getByTestId('review-prospect-name').innerText()).trim()
  await first.getByRole('button', { name: 'Approve' }).click()

  await expect(page.getByTestId('review-card')).toHaveCount(4)
  await expect(page.getByTestId('batch-progress')).toContainText('1/5 decided')
  await expect(page.getByTestId('decided-row')).toHaveCount(1)

  // the prospect's own page shows the flipped status
  await page.locator('summary', { hasText: 'Decided (1)' }).click()
  await page.getByTestId('decided-row').getByRole('link', { name }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('approved')
})

test('customers screen renders with the empty book (seed has no customers)', async ({ page }) => {
  await page.goto('/customers')
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
  await expect(page.getByTestId('customer-stats')).toContainText('0 active subscriptions')
  await expect(page.getByTestId('customer-stats')).toContainText('£0.00 MRR')
  await expect(page.getByText('No customers yet')).toBeVisible()
})

test('edits screen renders with an empty queue (seed has no edit requests)', async ({ page }) => {
  await page.goto('/edits')
  await expect(page.getByRole('heading', { name: 'Edit requests' })).toBeVisible()
  await expect(page.getByText('No open edit requests')).toBeVisible()
  await expect(page.getByText('Recently resolved (0)')).toBeVisible()
})

test('status board renders behind auth with the live readiness surfaces', async ({ page }) => {
  await page.goto('/status')
  await expect(page.getByRole('heading', { name: 'Status' })).toBeVisible()
  // dev/fixture env is non-production, so nothing is flagged critical
  await expect(page.getByTestId('status-nocriticals')).toBeVisible()
  // the ops worker card shows a live DB ping and a migration count against the journal
  await expect(page.getByText('DB up')).toBeVisible()
  await expect(page.getByText(/migrations \d+\/\d+/)).toBeVisible()
  // every service's real-vs-fixture mode is listed
  await expect(page.getByTestId('status-service-row').first()).toBeVisible()
})

test('entity control classifies a prospect and the audit trail shows it', async ({ page }) => {
  // Goyt Valley Builders seeds as entityType 'unknown'
  await page.goto('/pipeline?city=Stockport')
  await page.getByRole('link', { name: 'Goyt Valley Builders' }).click()

  await expect(page.getByTestId('entity-badge')).toHaveText('unknown')
  await page.getByRole('radio', { name: /Corporate \(Ltd/ }).check()
  await page.getByLabel('Note').fill('verified on Companies House, active Ltd')
  await page.getByRole('button', { name: 'Save classification' }).click()

  await expect(page.getByTestId('entity-badge')).toHaveText('corporate')
  await expect(page.getByTestId('timeline')).toContainText('entity_classified')
  await expect(page.getByTestId('timeline')).toContainText('operator')
})
