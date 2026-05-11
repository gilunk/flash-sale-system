import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/stress',
  // Stress tests can take a while when launching ~150 browser contexts.
  timeout: 180_000,
  // We control parallelism inside the test body itself; letting Playwright
  // fan tests out sideways adds noise to the metrics.
  fullyParallel: false,
  // A flaky stress test is usually a real symptom — investigate, don't retry.
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3201',
    headless: true,
    // Long action default for the post-click banner wait under load.
    actionTimeout: 30_000,
  },
  // Fail loudly if dev server is not running rather than spending 5min in retries.
  expect: {
    timeout: 30_000,
  },
});
