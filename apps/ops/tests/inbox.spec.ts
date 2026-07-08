import { expect, test } from '@playwright/test'

/**
 * Inbox smoke: the seed script files one needs_reply thread (an inbound reply
 * from the first fixture prospect) — the list must show it, the nav must
 * count it, and opening it must show the message.
 */

test('inbox lists the seeded thread and opens the conversation', async ({ page }) => {
  await page.goto('/inbox')
  await expect(page.getByTestId('inbox-thread-row')).toHaveCount(1)
  await expect(page.getByTestId('inbox-unread-badge')).toHaveText('1')

  await page.getByTestId('inbox-thread-row').click()
  await expect(page.getByTestId('inbox-message')).toHaveCount(1)
  await expect(page.getByTestId('inbox-message')).toContainText(
    'This looks great — how do I claim it?',
  )
  await expect(page.getByRole('button', { name: 'Send reply' })).toBeVisible()
})

test('insert claim link appends the claim URL to the reply draft', async ({ page }) => {
  await page.goto('/inbox')
  await page.getByTestId('inbox-thread-row').click()
  await page.getByRole('button', { name: 'Insert claim link' }).click()
  await expect(page.getByLabel('Reply')).toHaveValue(
    /You can claim your website and go live here: .+\/claim\//,
  )
})
