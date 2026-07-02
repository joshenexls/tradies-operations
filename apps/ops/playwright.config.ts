import { defineConfig } from '@playwright/test'

/**
 * Smoke suite for the ops desk. The webServer seeds a dedicated PGlite dir
 * (single-process — seeding must precede dev) then boots on port 3101 so a
 * local dev server on 3001 can keep running.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3101',
    // middleware enforces HTTP Basic auth — these are the documented dev defaults
    httpCredentials: { username: 'ops', password: 'tradies-dev' },
    // CI installs the matching browser build; local containers may pin an
    // older chromium at this well-known path (see repo env docs)
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command:
      'rm -rf .pglite/e2e && PGLITE_DIR=.pglite/e2e pnpm seed && PGLITE_DIR=.pglite/e2e pnpm exec next dev --port 3101',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
