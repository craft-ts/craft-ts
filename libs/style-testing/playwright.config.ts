import { defineConfig, devices } from '@playwright/test';

/**
 * The browser half of `@craft-ts/style-testing`, checked in a real engine.
 *
 * No `webServer`: every fixture is set with `page.setContent`, so the suite
 * runs without a dev server and without the demo's data. That is deliberate —
 * what is under test here is whether the digest reads a real layout engine
 * correctly, and pulling an application in would make a failure ambiguous
 * between the collector and the app.
 *
 * The determinism gate lives here rather than in the unit suite for the one
 * reason that matters: jsdom returns zeroes for every box, so a hundred
 * identical digests under jsdom would prove nothing at all.
 */
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
