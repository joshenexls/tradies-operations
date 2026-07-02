import { defineConfig } from 'vitest/config'

// PGlite WASM init + migrations can exceed the 5s/10s defaults when the whole
// repo's suites run in parallel under turbo on a CPU-limited container.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
