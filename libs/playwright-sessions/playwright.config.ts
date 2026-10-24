import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
