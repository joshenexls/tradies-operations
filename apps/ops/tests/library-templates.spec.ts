import { expect, test } from '@playwright/test'

/**
 * The seeded html design systems surface in the library: the craftsman-dark
 * card carries its kind badge, its template detail page shows the derived
 * manifest + DMCC strip record, and the fixture-content preview renders.
 */

test('craftsman-dark html system: badge, template detail, live preview', async ({
  page,
  request,
}) => {
  await page.goto('/library')
  const card = page.getByTestId('preset-card').filter({ hasText: 'Craftsman Dark' })
  await expect(card).toHaveCount(1)
  await expect(card.getByText('HTML system')).toBeVisible()

  await card.getByRole('link', { name: 'Details for Craftsman Dark' }).click()
  await expect(page.getByRole('heading', { name: 'Craftsman Dark' })).toBeVisible()
  await expect(page.getByTestId('template-status')).toHaveText('active')
  // manifest table + the recorded testimonials strip (DMCC trust surface)
  await expect(page.getByTestId('manifest-table')).toBeVisible()
  expect(await page.getByTestId('manifest-slot-row').count()).toBeGreaterThan(0)
  await expect(page.getByTestId('stripped-regions')).toContainText('testimonials')

  const src = await page.getByTestId('template-preview').getAttribute('src')
  expect(src).toMatch(/^\/library\/templates\/[0-9a-f-]+\/preview$/)
  const response = await request.get(src!)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/html')
  expect(response.headers()['x-robots-tag']).toContain('noindex')
  expect(await response.text()).toContain('Swift Flow Plumbing')
})
