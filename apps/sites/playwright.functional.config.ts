import { defineConfig } from '@playwright/test'

/**
 * Functional (non-visual) e2e for the conversion stack: claim → fixture
 * checkout → webhook → live → portal → lead alert, fully offline. Own port +
 * PGLITE_DIR so it never collides with the visual suite; SITE_FLAGS_CACHE_TTL_MS=0
 * so middleware sees go-live flips immediately.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /conversion\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3102',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command:
      'rm -rf .pglite/functional && PGLITE_DIR=.pglite/functional pnpm seed && PGLITE_DIR=.pglite/functional SITE_FLAGS_CACHE_TTL_MS=0 pnpm dev --port 3102',
    url: 'http://localhost:3102',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
