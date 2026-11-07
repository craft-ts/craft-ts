import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebugSessionStore } from './debug-session-store.js';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { createSuiteReplayer, type SuiteReplayResult } from './suite-replay.js';

type Snapshot = Record<string, unknown>;
const snapshot = (extra: Snapshot = {}): Snapshot => ({
  ready: true, failed: undefined, state: 'ready', replayIndex: 0, total: 3, seeking: false, difference: false, warnings: [], ...extra,
});

/** A dashboard whose worker answers `afterSeek` once the replay was asked to run to the end. */
function fakePlaywright(afterSeek: Snapshot[], options: { seekTo?: boolean } = {}) {
  let sought = false;
  let polls = 0;
  const visited: string[] = [];
  const page = {
    goto: vi.fn(async (url: string) => { visited.push(url); }),
    waitForFunction: vi.fn(),
    setViewportSize: vi.fn(),
    locator: vi.fn(),
    evaluate: vi.fn(async (_fn: unknown, arg?: unknown) => {
      if (typeof arg === 'number') {
        sought = true;
        return options.seekTo !== false;
      }
      if (!sought) return snapshot();
      const next = afterSeek[Math.min(polls, afterSeek.length - 1)];
      polls += 1;
      return next;
    }),
  };
  const browser = { version: () => 'test', newContext: async () => ({ newPage: async () => page }), close: vi.fn(async () => undefined) };
  return { loadPlaywright: async () => ({ chromium: { launch: async () => browser } }), visited, browser };
}

describe('createSuiteReplayer', () => {
  it('replays to the end with the suite flags, and says it went through', async () => {
    const fake = fakePlaywright([snapshot({ state: 'playing', replayIndex: 1, seeking: true }), snapshot({ state: 'completed', replayIndex: 3 })]);
    const replay = createSuiteReplayer({ dashboardUrl: 'http://localhost:4210/', loadPlaywright: fake.loadPlaywright, pollMs: 1 });
    const result = await replay('3f9d0a52-0c8e-4b9a-9d46-5b2b5c1f0a11');
    expect(result).toMatchObject({ status: 'completed', replayIndex: 3, total: 3, unprovenInteractions: [] });
    const url = new URL(fake.visited[0]!);
    expect([url.searchParams.get('replay-worker'), url.searchParams.get('replay-state'), url.searchParams.get('replay-mode'), url.hash])
      .toEqual(['1', 'recomputed', 'interaction', '#/sessions/3f9d0a52-0c8e-4b9a-9d46-5b2b5c1f0a11']);
    expect(fake.browser.close).toHaveBeenCalled();
  });

  it('names the gap a replay stops on', async () => {
    const difference = { eventId: 'confirm', expected: { calls: ['cart.clear'] }, actual: { calls: [], missing: ['cart.clear'] } };
    const fake = fakePlaywright([snapshot({ replayIndex: 2, difference: true, differenceDetail: difference })]);
    const result = await createSuiteReplayer({ dashboardUrl: 'http://localhost:4210/', loadPlaywright: fake.loadPlaywright, pollMs: 1 })('s');
    expect(result).toMatchObject({ status: 'diverged', replayIndex: 2, difference });
  });

  it('reports the actions replayed without their element', async () => {
    const note = '[Interaction non prouvée] Sélecteur introuvable pour click (#pay) : action rejouée par invocation, sans ses gestionnaires.';
    const fake = fakePlaywright([snapshot({ replayIndex: 3, warnings: ['autre note', note] })]);
    const result = await createSuiteReplayer({ dashboardUrl: 'http://localhost:4210/', loadPlaywright: fake.loadPlaywright, pollMs: 1 })('s');
    expect(result).toMatchObject({ status: 'completed', unprovenInteractions: [note], notes: ['autre note', note] });
  });

  it('says when there is no browser, and when the replay stops moving', async () => {
    const none = await createSuiteReplayer({ dashboardUrl: 'http://localhost:4210/', loadPlaywright: async () => { throw new Error('missing'); } })('s');
    expect(none).toMatchObject({ status: 'unavailable', message: expect.stringContaining('Playwright') });
    const stuck = fakePlaywright([snapshot({ state: 'playing', replayIndex: 1 })]);
    const stalled = await createSuiteReplayer({ dashboardUrl: 'http://localhost:4210/', loadPlaywright: stuck.loadPlaywright, pollMs: 1, stallMs: 20 })('s');
    expect(stalled).toMatchObject({ status: 'stalled', replayIndex: 1 });
  });

  it('replays one session at a time', async () => {
    let running = 0;
    let most = 0;
    const slow = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
      throw new Error('no browser');
    };
    const replay = createSuiteReplayer({ dashboardUrl: 'http://localhost:4210/', loadPlaywright: slow });
    await Promise.all([replay('a'), replay('b'), replay('c')]);
    expect(most).toBe(1);
  });
});

describe('POST /sessions/:id/suite-replay', () => {
  let directory: string;
  let sessionStore: DebugSessionStore;
  let server: ReturnType<typeof createLogHttpServer> | undefined;
  const id = '5c6f0d2e-8a1b-4c3d-9e7f-0a1b2c3d4e5f';

  const start = async (suiteReplay?: (sessionId: string) => Promise<SuiteReplayResult>) => {
    server = createLogHttpServer({ store: new LogStore({ directory: join(directory, 'logs') }), sessionStore, ...(suiteReplay ? { suiteReplay } : {}) });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'suite-replay-http-'));
    sessionStore = new DebugSessionStore(join(directory, 'sessions'));
    sessionStore.begin(id, { format: 'craft-debug-session', version: 6, startUrl: 'http://localhost:4204/', exportedAt: 0, truncated: false, events: [], clips: [] } as never, '2026-11-07T08:00:00.000Z');
    sessionStore.finish(id, 'completed');
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    sessionStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('replays an archived session and answers with the outcome', async () => {
    const outcome: SuiteReplayResult = { sessionId: id, status: 'completed', replayIndex: 3, total: 3, unprovenInteractions: [], notes: [], durationMs: 5 };
    const replay = vi.fn(async () => outcome);
    const base = await start(replay);
    const response = await fetch(`${base}/sessions/${id}/suite-replay`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(outcome);
    expect(replay).toHaveBeenCalledWith(id);
    expect((await fetch(`${base}/sessions/00000000-0000-4000-8000-000000000000/suite-replay`, { method: 'POST' })).status).toBe(404);
  });

  it('says the replay is off when the server has none', async () => {
    const base = await start();
    const response = await fetch(`${base}/sessions/${id}/suite-replay`, { method: 'POST' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'unavailable' });
  });
});
