import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayGoldenSession } from '@craft-ts/playwright-sessions/suite';
import { test, craftSession, expect } from './fixtures';
import { DISCONNECT_CONFIRM_BUTTON, harness, measurePage, recordPurchaseByHand, type Measured } from './golden-helpers';

/**
 * The regression suite's replay on a session a person made: a purchase in a
 * browser of its own (no test metadata, as by hand), then replayed by the
 * suite's runner: each action dispatched on its element (the app's handlers
 * run) and the state recomputed by the code instead of restored. A healthy
 * journey must go through without a gap, every moment of the plan must give a
 * picture and a layout digest, and the last one must be the screen the person
 * saw — the order confirmation, which only the click's handler produces.
 */
test('rejoue un parcours enregistré en laissant le code recalculer l’état', {
  annotation: craftSession({ id: 'shop.golden-replay', capture: 'none' }),
}, async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const { server, dashboard, app } = harness(baseURL);
  const sessionId = await test.step('un parcours fait à la main, archivé et terminé', () => recordPurchaseByHand(browser, app, server));

  const replay = (
    stateSource: 'recorded' | 'recomputed',
    replayMode: 'invocation' | 'interaction',
    breakApp?: string,
    debug?: (line: string) => void,
  ) => test.step(`rejoué par la suite (${stateSource}, ${replayMode}${breakApp ? ', app cassée' : ''})`, async () => {
    const context = await browser.newContext();
    if (breakApp) await context.addInitScript(breakApp);
    try {
      return await replayGoldenSession(context, {
        dashboardUrl: dashboard, sessionId, maxPoints: 8, stateSource, replayMode,
        ...(debug ? { debug } : {}),
        measure: measurePage,
      });
    } finally {
      await context.close();
    }
  });
  if (process.env['GOLDEN_DIAGNOSE'] === '1') {
    const recorded = await replay('recorded', 'invocation');
    await testInfo.attach('recorded.json', { body: JSON.stringify({ ...recorded, captures: recorded.captures.length }, null, 2), contentType: 'application/json' });
    console.log('RECORDED', JSON.stringify({ ...recorded, captures: recorded.captures.length }));
  }
  const result = await replay('recomputed', 'interaction');
  const measured = (capture: (typeof result.captures)[number]) => capture.digest as Measured | undefined;

  // To look at a green run's pictures: attachments only survive a failure.
  const keep = process.env['GOLDEN_CAPTURE_DIR'];
  if (keep) {
    mkdirSync(keep, { recursive: true });
    for (const capture of result.captures) {
      writeFileSync(join(keep, `moment-${capture.replayIndex}.png`), capture.png);
      writeFileSync(join(keep, `moment-${capture.replayIndex}.digest.json`), JSON.stringify(measured(capture)?.digest, null, 2));
    }
  }
  for (const capture of result.captures)
    await testInfo.attach(`moment-${capture.replayIndex}.png`, { body: capture.png, contentType: 'image/png' });
  const summary = { ...result, captures: result.captures.map(({ png: _png, digest, ...capture }) => ({ ...capture, nodes: (digest as Measured | undefined)?.digest.nodes.length ?? 0 })) };
  await testInfo.attach('golden-replay.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });

  expect(result.status, JSON.stringify(summary, null, 2)).toBe('completed');
  expect(result.replayIndex).toBe(result.total);
  expect(result.captures.length).toBeGreaterThan(1);
  expect(result.unprovenInteractions).toEqual([]);
  for (const capture of result.captures)
    expect(measured(capture)?.digest.nodes.length ?? 0, `moment ${capture.replayIndex}`).toBeGreaterThan(0);
  // `innerText` reads the text as displayed: the heading is upper-cased by its style.
  expect(measured(result.captures.at(-1)!)?.text).toMatch(/merci pour votre commande/i);

  // The log server replays it the same way on its own, as an agent asks it to
  // after an edit (sessions.replay of the logs MCP): no dashboard to open.
  const byServer = await test.step('rejoué par le log server', async () => {
    const response = await fetch(`${server}/sessions/${sessionId}/suite-replay`, { method: 'POST' });
    return await response.json() as { status: string; replayIndex: number; total: number; unprovenInteractions: string[] };
  });
  expect(byServer, JSON.stringify(byServer)).toMatchObject({ status: 'completed', unprovenInteractions: [] });
  expect(byServer.replayIndex).toBe(byServer.total);

  // The same recording on an app whose confirmation button lost its handler:
  // calling the recorded methods would pass, dispatching the click does not.
  const disconnected = await replay('recomputed', 'interaction', DISCONNECT_CONFIRM_BUTTON, process.env['GOLDEN_DEBUG'] === '1' ? (line) => console.log('CONSOLE', line) : undefined);
  await testInfo.attach('disconnected.json', { body: JSON.stringify({ ...disconnected, captures: disconnected.captures.length }, null, 2), contentType: 'application/json' });
  expect(disconnected.status, JSON.stringify({ ...disconnected, captures: disconnected.captures.length })).toBe('diverged');
  // The gap names the call the click no longer makes (with, depending on the
  // recording's timing, the end of an earlier cart sync in the same interval).
  expect(disconnected.difference?.actual).toMatchObject({ missing: expect.arrayContaining(['service:cart / mutation:syncServerCart / method:mutate']) });
});
