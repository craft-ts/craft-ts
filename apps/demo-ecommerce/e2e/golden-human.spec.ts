import { replayGoldenSession } from '@craft-ts/playwright-sessions/suite';
import { test, craftSession, expect } from './fixtures';
import { DISCONNECT_CONFIRM_BUTTON, harness, recordAbandonedPurchase, recordPurchaseWithReload, recordVisitByHand } from './golden-helpers';

type ServerReplay = {
  status: string; replayIndex: number; total: number; unprovenInteractions: string[]; notes: string[]; difference?: unknown;
  tailCut?: { reason: string; keptSteps: number; droppedSteps: number };
};

/**
 * The suite on gestures a scripted purchase leaves out: pointer moves, a
 * search typed key by key, a sign-in typed then sent with Enter. Each typed
 * key and each click must be replayed on its element by the log server (as an
 * agent asks it to), each search recomputed by the code.
 */
test('rejoue une visite faite à la main, touche par touche', {
  annotation: craftSession({ id: 'shop.golden-human', capture: 'none' }),
}, async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const { server, app } = harness(baseURL);
  const sessionId = await test.step('une visite à la main, archivée et terminée', () => recordVisitByHand(browser, app, server));

  const result = await test.step('rejouée par le log server', async () => {
    const response = await fetch(`${server}/sessions/${sessionId}/suite-replay`, { method: 'POST' });
    return await response.json() as ServerReplay;
  });
  await testInfo.attach('server-replay.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (process.env['GOLDEN_DEBUG'] === '1') console.log('HUMAN', JSON.stringify(result, null, 2));

  expect(result, JSON.stringify(result, null, 2)).toMatchObject({ status: 'completed', unprovenInteractions: [] });
  expect(result.replayIndex).toBe(result.total);
  // The demo records what is typed, its password included: every key is typed again.
  expect(result.notes.filter((note) => note.startsWith('[Saisie non enregistrée]'))).toEqual([]);
});

/**
 * A purchase abandoned while its order was on its way: the recording ends on
 * a request with no answer, which no replay can finish. The suite replays
 * what came before (the cart filled, the checkout page reached) and says
 * what it left out, instead of refusing the whole session.
 */
test('rejoue la partie terminée d’un achat abandonné en pleine commande', {
  annotation: craftSession({ id: 'shop.golden-abandoned', capture: 'none' }),
}, async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const { server, app } = harness(baseURL);
  const sessionId = await test.step('un achat abandonné, archivé', () => recordAbandonedPurchase(browser, app, server));

  const result = await test.step('rejoué par le log server', async () => {
    const response = await fetch(`${server}/sessions/${sessionId}/suite-replay`, { method: 'POST' });
    return await response.json() as ServerReplay;
  });
  await testInfo.attach('server-replay.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (process.env['GOLDEN_DEBUG'] === '1') console.log('ABANDONED', JSON.stringify(result, null, 2));

  expect(result, JSON.stringify(result, null, 2)).toMatchObject({
    status: 'completed',
    unprovenInteractions: [],
    tailCut: { reason: 'missing-result' },
  });
  expect(result.replayIndex).toBe(result.total);
  // The cart was filled and the checkout reached before the order was sent.
  expect(result.tailCut!.keptSteps).toBeGreaterThanOrEqual(3);
  expect(result.tailCut!.droppedSteps).toBeGreaterThanOrEqual(1);
});

/**
 * A purchase with F5 in the middle: the page loaded again starts a new app in
 * the same recording. The replay follows it in a tab of its own, started at
 * the reloaded address with the browser storage it had: the whole purchase
 * replays, nothing is cut.
 */
test('rejoue un achat avec un rechargement de page au milieu', {
  annotation: craftSession({ id: 'shop.golden-reload', capture: 'none' }),
}, async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const { server, app } = harness(baseURL);
  const sessionId = await test.step('un achat avec F5, archivé', () => recordPurchaseWithReload(browser, app, server));

  const result = await test.step('rejoué par le log server', async () => {
    const response = await fetch(`${server}/sessions/${sessionId}/suite-replay`, { method: 'POST' });
    return await response.json() as ServerReplay;
  });
  await testInfo.attach('server-replay.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (process.env['GOLDEN_DEBUG'] === '1') console.log('RELOAD', JSON.stringify(result, null, 2));

  expect(result, JSON.stringify(result, null, 2)).toMatchObject({ status: 'completed', unprovenInteractions: [] });
  expect(result.tailCut).toBeUndefined();
  expect(result.replayIndex).toBe(result.total);

  // The reloaded page runs the app's handlers: with the confirmation button
  // disconnected after the reload, the replay stops on the call it lost.
  const disconnected = await test.step('rejoué avec le bouton de confirmation débranché', async () => {
    const context = await browser.newContext();
    await context.addInitScript(DISCONNECT_CONFIRM_BUTTON);
    try {
      return await replayGoldenSession(context, { dashboardUrl: harness(baseURL).dashboard, sessionId, maxPoints: 4 });
    } finally {
      await context.close();
    }
  });
  expect(disconnected.status, JSON.stringify({ ...disconnected, captures: disconnected.captures.length })).toBe('diverged');
  expect(disconnected.difference?.actual).toMatchObject({ missing: expect.arrayContaining(['service:cart / mutation:syncServerCart / method:mutate']) });
});

