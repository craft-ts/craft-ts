import { test, craftSession, expect } from './fixtures';
import { harness, recordVisitByHand } from './golden-helpers';

type ServerReplay = { status: string; replayIndex: number; total: number; unprovenInteractions: string[]; notes: string[]; difference?: unknown };

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
