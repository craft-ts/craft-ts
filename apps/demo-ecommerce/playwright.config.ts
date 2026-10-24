import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appPort = process.env['CRAFT_E2E_ECOMMERCE_PORT'] ?? '4205';
const serverPort = process.env['CRAFT_E2E_SESSION_SERVER_PORT'] ?? '4322';
const appOrigin = `http://localhost:${appPort}`;
const serverOrigin = `http://127.0.0.1:${serverPort}`;
const sessionDir = process.env['CRAFT_E2E_SESSION_DIR'] ?? resolve(workspaceRoot, 'apps/demo-ecommerce/tmp/debug-sessions');

process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] = serverOrigin;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: appOrigin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `LOG_SERVER_PORT=${serverPort} LOG_SERVER_ALLOWED_ORIGINS=${appOrigin} DEBUG_SESSION_DIR=${sessionDir} CRAFT_E2E_SESSION_STORE=${resolve(workspaceRoot, 'apps/demo-ecommerce/e2e/__sessions__')} DEBUG_SESSION_MAX_SESSIONS=1000 DEBUG_SESSION_THUMBNAILS=0 LOG_SERVER_QUIET=1 npm run logs:server`,
      url: `${serverOrigin}/health`, reuseExistingServer: false, cwd: workspaceRoot, timeout: 120_000,
    },
    {
      command: `CRAFT_DEMO_ECOMMERCE_PORT=${appPort} VITE_CRAFT_LOG_SERVER_URL=${serverOrigin} npx vite --config apps/demo-ecommerce/vite.config.ts --host localhost --strictPort`,
      url: `${appOrigin}/`, reuseExistingServer: false, cwd: workspaceRoot, timeout: 120_000,
    },
  ],
});
