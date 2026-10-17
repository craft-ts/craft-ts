import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const demoPort = process.env['CRAFT_E2E_DEMO_PORT'] ?? '4201';
const dashboardPort = process.env['CRAFT_E2E_DASHBOARD_PORT'] ?? '4211';
const sessionServerPort =
  process.env['CRAFT_E2E_SESSION_SERVER_PORT'] ?? '4321';
const sessionDir =
  process.env['CRAFT_E2E_SESSION_DIR'] ??
  resolve(
    workspaceRoot,
    'apps/log-server/tmp/debug-session-replay-e2e-multitab',
  );
const demoOrigin = `http://localhost:${demoPort}`;
const dashboardOrigin = `http://localhost:${dashboardPort}`;
const sessionServerOrigin = `http://127.0.0.1:${sessionServerPort}`;
const reuseExistingServer = false;

process.env['CRAFT_E2E_DEMO_ORIGIN'] = demoOrigin;
process.env['CRAFT_E2E_DASHBOARD_ORIGIN'] = dashboardOrigin;
process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] = sessionServerOrigin;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: dashboardOrigin,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `LOG_SERVER_PORT=${sessionServerPort} LOG_SERVER_ALLOWED_ORIGINS=${demoOrigin},${dashboardOrigin} DEBUG_SESSION_DIR=${sessionDir} DEBUG_SESSION_MAX_SESSIONS=1000 LOG_SERVER_QUIET=1 npm run logs:server`,
      url: `${sessionServerOrigin}/health`,
      reuseExistingServer,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: `CRAFT_DEMO_PORT=${demoPort} VITE_CRAFT_LOG_SERVER_URL=${sessionServerOrigin} VITE_CRAFT_REPLAY_DASHBOARD_ORIGIN=${dashboardOrigin} npx vite --config apps/demo/vite.config.ts --host localhost --strictPort`,
      url: `${demoOrigin}/`,
      reuseExistingServer,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: `CRAFT_DASHBOARD_PORT=${dashboardPort} VITE_CRAFT_SESSION_ARCHIVE_URL=${sessionServerOrigin} VITE_CRAFT_REPLAY_TARGET_URL=${demoOrigin}/ npx vite --config apps/debug-session-dashboard/vite.config.ts --host localhost --strictPort`,
      url: `${dashboardOrigin}/`,
      reuseExistingServer,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
  ],
});
