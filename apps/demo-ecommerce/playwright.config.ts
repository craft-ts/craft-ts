import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appPort = process.env['CRAFT_E2E_ECOMMERCE_PORT'] ?? '4205';
const serverPort = process.env['CRAFT_E2E_SESSION_SERVER_PORT'] ?? '4322';
// 4211 est le dashboard de sa propre config e2e : les deux suites peuvent tourner ensemble.
const dashboardPort = process.env['CRAFT_E2E_SESSION_DASHBOARD_PORT'] ?? '4212';
const appOrigin = `http://localhost:${appPort}`;
const serverOrigin = `http://127.0.0.1:${serverPort}`;
const dashboardOrigin = `http://localhost:${dashboardPort}`;
const sessionDir = process.env['CRAFT_E2E_SESSION_DIR'] ?? resolve(workspaceRoot, 'apps/demo-ecommerce/tmp/debug-sessions');
const storePath = resolve(workspaceRoot, 'apps/demo-ecommerce/tmp/e2e-store.json');

process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] = serverOrigin;
process.env['CRAFT_E2E_SESSION_DASHBOARD_ORIGIN'] = dashboardOrigin;
process.env['CRAFT_DEMO_ECOMMERCE_STORE'] = storePath;

export default defineConfig({
  testDir: './e2e',
  // Hors de git : des artefacts dans `test-results/` rendraient l'arbre « dirty » pendant le run.
  outputDir: './tmp/test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: appOrigin,
    trace: 'retain-on-failure',
    craftSessionsOptions: {
      replayBaselineOnFailure: true,
      dashboardUrl: `${dashboardOrigin}/`,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `LOG_SERVER_PORT=${serverPort} LOG_SERVER_ALLOWED_ORIGINS=${appOrigin},${dashboardOrigin} DEBUG_SESSION_DIR=${sessionDir} DEBUG_SESSION_DASHBOARD_URL=${dashboardOrigin}/ CRAFT_E2E_SESSION_STORE=${resolve(workspaceRoot, 'apps/demo-ecommerce/e2e/__sessions__')} DEBUG_SESSION_MAX_SESSIONS=1000 DEBUG_SESSION_THUMBNAILS=0 LOG_SERVER_QUIET=1 npm run logs:server`,
      url: `${serverOrigin}/health`, reuseExistingServer: false, cwd: workspaceRoot, timeout: 120_000,
    },
    {
      command: `CRAFT_DEMO_ECOMMERCE_STORE=${storePath} CRAFT_DEMO_ECOMMERCE_PORT=${appPort} VITE_CRAFT_LOG_SERVER_URL=${serverOrigin} VITE_CRAFT_REPLAY_DASHBOARD_ORIGIN=${dashboardOrigin} npx vite --config apps/demo-ecommerce/vite.config.ts --host localhost --strictPort`,
      url: `${appOrigin}/`, reuseExistingServer: false, cwd: workspaceRoot, timeout: 120_000,
    },
    {
      command: `CRAFT_DASHBOARD_PORT=${dashboardPort} VITE_CRAFT_SESSION_ARCHIVE_URL=${serverOrigin} VITE_CRAFT_SESSION_DASHBOARD_URL=${dashboardOrigin}/ npx vite --config apps/debug-session-dashboard/vite.config.ts --host localhost --strictPort`,
      url: `${dashboardOrigin}/`, reuseExistingServer: false, cwd: workspaceRoot, timeout: 120_000,
    },
  ],
});
