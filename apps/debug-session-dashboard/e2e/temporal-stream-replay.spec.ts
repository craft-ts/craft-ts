import { expect, test } from '@playwright/test';

const DEMO_ORIGIN =
  process.env['CRAFT_E2E_DEMO_ORIGIN'] ?? 'http://localhost:4201';
const DASHBOARD_ORIGIN =
  process.env['CRAFT_E2E_DASHBOARD_ORIGIN'] ?? 'http://localhost:4211';
const SESSION_SERVER_ORIGIN =
  process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4321';

type SessionSummary = Readonly<{ id: string }>;

test('replays independent user streams and their timeout deadlines', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const previousSessions = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((session) => session.id),
  );

  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/temporal-stream-replay`);
  await expect(
    demo.getByRole('heading', { name: 'Replay · streams et délais' }),
  ).toBeVisible();

  await demo.waitForTimeout(500);
  await demo.getByTestId('alice-heartbeat').click();
  await demo.waitForTimeout(300);
  await demo.getByTestId('bob-heartbeat').click();
  await demo.waitForTimeout(2_000);
  // This late heartbeat advances the recorded timeline past all three deadlines.
  await demo.getByTestId('chloe-heartbeat').click();

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
      const sessions = (await response.json()) as {
        sessions: readonly SessionSummary[];
      };
      sessionId =
        sessions.sessions.find((session) => !previousSessions.has(session.id))
          ?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );

  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(replayApp.getByTestId('alice-value')).toHaveText(
    'timeout (1200 ms)',
    { timeout: 30_000 },
  );
  await expect(replayApp.getByTestId('bob-value')).toHaveText(
    'timeout (1500 ms)',
  );
  await expect(replayApp.getByTestId('chloe-value')).toHaveText(
    'timeout (2000 ms)',
  );
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    'terminé',
  );

  await context.close();
});
