import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const demoPort = process.env['CRAFT_E2E_DEMO_PORT'] ?? '4602';
const dashboardPort = process.env['CRAFT_E2E_DASHBOARD_PORT'] ?? '4604';
const sessionServerPort = process.env['CRAFT_E2E_SESSION_SERVER_PORT'] ?? '4603';
const sessionDir =
  process.env['CRAFT_E2E_SESSION_DIR'] ??
  resolve(workspaceRoot, 'apps/log-server/tmp/ecommerce-resume-e2e');
// Chaque run part du catalogue initial, dans un magasin jetable : les
// commandes et paniers des scénarios ne touchent jamais `data/store.json`.
const storePath =
  process.env['ECOMMERCE_STORE_PATH'] ??
  join(mkdtempSync(join(tmpdir(), 'craft-ecommerce-resume-')), 'store.json');
process.env['ECOMMERCE_STORE_PATH'] = storePath;
const demoOrigin = `http://localhost:${demoPort}`;
const dashboardOrigin = `http://localhost:${dashboardPort}`;
const sessionServerOrigin = `http://127.0.0.1:${sessionServerPort}`;

process.env['CRAFT_E2E_DEMO_ORIGIN'] = demoOrigin;
process.env['CRAFT_E2E_DASHBOARD_ORIGIN'] = dashboardOrigin;
process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] = sessionServerOrigin;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: demoOrigin,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `LOG_SERVER_PORT=${sessionServerPort} LOG_SERVER_ALLOWED_ORIGINS=${demoOrigin},${dashboardOrigin} DEBUG_SESSION_DIR=${sessionDir} DEBUG_SESSION_MAX_SESSIONS=1000 DEBUG_SESSION_THUMBNAILS=0 LOG_SERVER_QUIET=1 npm run logs:server`,
      url: `${sessionServerOrigin}/health`,
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: `CRAFT_E2E=1 ECOMMERCE_STORE_PATH=${storePath} VITE_CRAFT_LOG_SERVER_URL=${sessionServerOrigin} VITE_CRAFT_REPLAY_DASHBOARD_ORIGIN=${dashboardOrigin} npx vite --config apps/demo-ecommerce/vite.config.ts --host localhost --port ${demoPort} --strictPort`,
      url: `${demoOrigin}/`,
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: `VITE_CRAFT_SESSION_ARCHIVE_URL=${sessionServerOrigin} VITE_CRAFT_REPLAY_TARGET_URL=${demoOrigin}/ npx vite --config apps/debug-session-dashboard/vite.config.ts --host localhost --port ${dashboardPort} --strictPort`,
      url: `${dashboardOrigin}/`,
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
  ],
});
