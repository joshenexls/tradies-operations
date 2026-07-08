import { defineConfig } from '@playwright/test'

/**
 * Visual regression across templates × fixture businesses × viewports.
 * The webServer seeds PGlite first (single-process — must precede dev).
 * Baselines live in tests/__screenshots__ and are committed.
 */
export default defineConfig({
  testDir: './tests',
  // the conversion suite has its own config (playwright.functional.config.ts)
  testIgnore: /conversion\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://localhost:3100',
    // CI installs the matching browser build; local containers may pin an
    // older chromium at this well-known path (see repo env docs)
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    // CHAT_WIDGET=0 keeps the JS-injected chat button out of the screenshots;
    // MAPS_EMBED=0 drops the Google Maps iframe — both load from the network,
    // so disabling them keeps baselines deterministic regardless of runner net
    command:
      'rm -rf .pglite/visual && PGLITE_DIR=.pglite/visual pnpm seed && PGLITE_DIR=.pglite/visual CHAT_WIDGET=0 MAPS_EMBED=0 pnpm dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
