import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { compareSessionTraces, normalizeSessionTrace } from '@craft-ts/session-trace';

const sessionServerOrigin = process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN']!;
const RUN = '7a6c4f8e-1d2b-4c3a-9e8f-0123456789ab';
type Event = Record<string, unknown>;

/** The pilot's green checkout, and the same journey with the order answering 500. */
function sessions() {
  const file = resolve(process.cwd(), 'packages/session-trace/src/__fixtures__/shop.checkout.session.json.gz');
  const baseline = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as { events: Event[] };
  const observed = {
    ...baseline,
    events: baseline.events.map((event) => ({
      ...event,
      id: `${String(event['id'])}-observed`,
      ...(event['operationId'] === 'fetch-4' && event['phase'] === 'succeeded' ? { response: { status: 500, body: '"{}"' } } : {}),
    })),
  };
  return { baseline, observed };
}

test('shows the first divergence and places both replays on its event', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The comparison view does not depend on the engine.');
  const { baseline, observed } = sessions();
  const comparison = compareSessionTraces(normalizeSessionTrace(observed), [normalizeSessionTrace(baseline)]);
  const orderStart = baseline.events.find((event) => event['operationId'] === 'fetch-4' && event['phase'] === 'started')!;
  const baselineSource = `/e2e-sessions/shop.checkout/chromium/run.session.json.gz?root=0&decompress=1`;
  await page.route(`${sessionServerOrigin}/e2e-sessions/compare?**`, (route) => route.fulfill({
    json: { testId: 'shop.checkout', project: 'chromium', sessionId: RUN, observed, observedSource: `/sessions/${RUN}`, baselines: [{ source: baselineSource, session: baseline }], comparison },
  }));
  await page.route(`${sessionServerOrigin}/e2e-sessions/shop.checkout/**`, (route) => route.fulfill({ json: baseline }));
  await page.route(`${sessionServerOrigin}/sessions/${RUN}`, (route) => route.fulfill({ json: observed }));
  // Each replay frame keeps the positioning messages it receives.
  await page.addInitScript(() => {
    const received: unknown[] = [];
    Object.defineProperty(window, '__e2eReplayMessages', { value: received });
    window.addEventListener('message', (message) => {
      if ((message.data as { protocol?: string } | null)?.protocol === 'craft-e2e-replay') received.push(message.data);
    });
  });

  await page.goto(`/#/compare?${new URLSearchParams({ test: 'shop.checkout', project: 'chromium', run: RUN })}`);
  const first = page.locator('[data-lab="e2e-first-divergence"]');
  await expect(first).toContainText('Première divergence · Valeur différente');
  await expect(first).toContainText('server-fn:ecommerce.checkout · status : 200 → 500');
  expect(await page.locator('[data-lab="e2e-comparison-raw"]').getAttribute('open')).toBeNull();

  const firstFinding = page.locator('[data-lab="e2e-comparison-finding"][data-first="true"]');
  await expect(firstFinding).toHaveCount(1);
  await expect(firstFinding).toContainText('Valeur différente');
  await firstFinding.click();
  for (const [side, eventId] of [['baseline', String(orderStart['id'])], ['observed', `${String(orderStart['id'])}-observed`]] as const) {
    const frame = page.frameLocator(`[data-lab="e2e-replay-${side}"]`);
    await expect(frame.locator('body')).toBeAttached();
    const marker = side === 'baseline' ? 'run.session.json.gz' : RUN;
    await expect.poll(() => page.frame({ url: (url) => url.hash.includes('e2e-replay') && url.hash.includes(marker) })
      ?.evaluate(() => (window as unknown as { __e2eReplayMessages: unknown[] }).__e2eReplayMessages), { timeout: 15_000 })
      .toContainEqual({ protocol: 'craft-e2e-replay', eventId });
  }
});
