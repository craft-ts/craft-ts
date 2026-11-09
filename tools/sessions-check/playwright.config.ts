import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The runner of `sessions-check.mjs`: one test, the whole check. Its servers
 * are started and stopped by the check itself (each build in turn, at the
 * recorded origin); the archive and the dashboard are the developer's.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'sessions-check.spec.ts',
  outputDir: join(tmpdir(), 'craft-sessions-check-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Three replays of each session, and two builds served: hours, not seconds.
  timeout: 4 * 60 * 60_000,
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
