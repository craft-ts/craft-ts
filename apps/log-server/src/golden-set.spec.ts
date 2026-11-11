import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isGoldenSetManifest } from '@craft-ts/session-trace';
import { DebugSessionStore } from './debug-session-store.js';
import { goldenSetCandidates, type StoredSessionForGoldenSet } from './golden-set-candidates.js';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';

const trace = { steps: [], hash: 'h' };
const stored = (
  id: string,
  summary: Partial<StoredSessionForGoldenSet['summary']> = {},
  thumbnails?: StoredSessionForGoldenSet['thumbnails'],
): StoredSessionForGoldenSet => ({
  summary: { id, startUrl: 'http://localhost:4204/catalogue', createdAt: '2026-11-07T08:00:00.000Z', status: 'completed', truncated: false, ...summary },
  trace,
  ...(thumbnails ? { thumbnails } : {}),
});

describe('goldenSetCandidates', () => {
  it('keeps the finished, whole journeys a person made on the app', () => {
    const { candidates, skipped } = goldenSetCandidates([
      stored('mine'),
      stored('interrupted', { status: 'interrupted' }),
      stored('other', { startUrl: 'http://localhost:4200/' }),
      stored('e2e', { test: { id: 'shop.checkout' } as never }),
      stored('resume', { resume: { kind: 'guided-resume' } as never }),
      stored('live', { status: 'recording' }),
      stored('cut', { truncated: true }),
    ], 'http://localhost:4204/');
    expect(candidates.map((candidate) => candidate.sessionId)).toEqual(['mine', 'interrupted']);
    expect(skipped).toEqual([
      { sessionId: 'e2e', reason: 'tooling' },
      { sessionId: 'resume', reason: 'tooling' },
      { sessionId: 'live', reason: 'recording' },
      { sessionId: 'cut', reason: 'truncated' },
    ]);
  });

  it('reads whether a session replays from the replay its thumbnails ran', () => {
    const { candidates } = goldenSetCandidates([
      stored('went-through', {}, { status: 'ready' }),
      stored('stopped', {}, { status: 'failed', stoppedAtReplayIndex: 3 }),
      stored('no-browser', {}, { status: 'unavailable' }),
      stored('never'),
    ], 'http://localhost:4204');
    expect(candidates.map((candidate) => [candidate.sessionId, candidate.replayable])).toEqual([
      ['went-through', true], ['stopped', false], ['no-browser', undefined], ['never', undefined],
    ]);
  });
});

describe('POST /sessions/golden-set', () => {
  let directory: string;
  let sessionStore: DebugSessionStore;
  let server: ReturnType<typeof createLogHttpServer>;
  let baseUrl: string;

  const record = (id: string, startUrl: string, events: Record<string, unknown>[], version = 8) => {
    sessionStore.begin(id, {
      format: 'craft-debug-session', version, startUrl, exportedAt: 0, truncated: false, events, clips: [],
    } as never, '2026-11-07T08:00:00.000Z');
    sessionStore.finish(id, 'completed');
  };
  const call = (sequence: number, behavior: string) => [
    { id: `s${sequence}`, sequence, timestamp: sequence, kind: 'craft', phase: 'started', operationId: `op${sequence}`, payload: { behavior } },
    { id: `e${sequence}`, sequence: sequence + 1, timestamp: sequence + 1, kind: 'craft', phase: 'succeeded', operationId: `op${sequence}` },
  ];
  const post = (body: unknown) => fetch(`${baseUrl}/sessions/golden-set`, { method: 'POST', body: JSON.stringify(body) });

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'golden-set-http-'));
    sessionStore = new DebugSessionStore(join(directory, 'sessions'));
    server = createLogHttpServer({ store: new LogStore({ directory: join(directory, 'logs') }), sessionStore });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sessionStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('proposes the set of one app from the archive', async () => {
    record('11111111-1111-4111-8111-111111111111', 'http://localhost:4204/', call(1, 'cart.add'));
    record('22222222-2222-4222-8222-222222222222', 'http://localhost:4204/', [...call(1, 'cart.add'), ...call(3, 'cart.clear')]);
    record('33333333-3333-4333-8333-333333333333', 'http://localhost:4200/', call(1, 'other.app'));
    const response = await post({ origin: 'http://localhost:4204', app: 'demo-ecommerce' });
    expect(response.status).toBe(200);
    const body = await response.json() as { manifest: unknown; rejected: unknown; candidates: number };
    expect(isGoldenSetManifest(body.manifest)).toBe(true);
    expect(body.candidates).toBe(2);
    expect(body.manifest).toMatchObject({
      app: 'demo-ecommerce',
      sessions: [{ sessionId: '22222222-2222-4222-8222-222222222222', status: 'unverified', units: ['invocation:cart.add', 'invocation:cart.clear'] }],
    });
    expect(body.rejected).toEqual([{ sessionId: '11111111-1111-4111-8111-111111111111', reason: 'redundant' }]);
  });

  it('counts only what the replay goes through: not the request a closed tab left unanswered', async () => {
    record('44444444-4444-4444-8444-444444444444', 'http://localhost:4204/', [
      ...call(1, 'cart.add'),
      { id: 'pay', sequence: 3, timestamp: 3, kind: 'dom', phase: 'emitted', payload: { action: 'click', selector: '#pay' } },
      { id: 'pay-call', sequence: 4, timestamp: 4, kind: 'craft', phase: 'started', operationId: 'op4', payload: { behavior: 'checkout.pay' } },
      { id: 'pay-http', sequence: 5, timestamp: 5, kind: 'http', phase: 'started', operationId: 'http5', payload: { method: 'POST', url: 'http://localhost:4204/api/pay' } },
      // Recorded after the request that never answered: no replay reaches it.
      ...call(6, 'cart.clear'),
    ]);
    const body = await (await post({ origin: 'http://localhost:4204', app: 'demo-ecommerce' })).json() as { manifest: { sessions: { units: string[] }[] } };
    expect(body.manifest.sessions[0]?.units).toEqual(['invocation:cart.add']);
  });

  it('leaves out what the resume tooling opened, however it is marked', async () => {
    // A guided resume booted the app with its launch parameter; a recipe run
    // starts with it. Neither carries resume metadata in the summary.
    record('55555555-5555-4555-8555-555555555555', 'http://localhost:4204/', [
      { id: 'boot', sequence: 1, timestamp: 1, kind: 'component-lifecycle', phase: 'emitted', name: 'create:Shell', payload: { routeUrl: '/formule?craft-resume=abc&craft-resume-before=12' } },
      ...call(2, 'cart.add'),
    ]);
    record('66666666-6666-4666-8666-666666666666', 'http://localhost:4204/?craft-resume-recipe=r1', call(1, 'cart.clear'));
    const body = await (await post({ origin: 'http://localhost:4204', app: 'demo-ecommerce' })).json() as { skipped: { sessionId: string; reason: string }[]; candidates: number };
    expect(body.candidates).toBe(0);
    expect(body.skipped).toEqual(expect.arrayContaining([
      { sessionId: '55555555-5555-4555-8555-555555555555', reason: 'tooling' },
      { sessionId: '66666666-6666-4666-8666-666666666666', reason: 'tooling' },
    ]));
  });

  it('leaves out a session recorded before the app\'s exchanges were', async () => {
    // Version 6 kept no answer for the app's calls: its replay stops at the first.
    record('77777777-7777-4777-8777-777777777777', 'http://localhost:4204/', call(1, 'cart.add'), 6);
    const body = await (await post({ origin: 'http://localhost:4204', app: 'demo-ecommerce' })).json() as { skipped: { sessionId: string; reason: string }[]; candidates: number };
    expect(body.candidates).toBe(0);
    expect(body.skipped).toEqual([{ sessionId: '77777777-7777-4777-8777-777777777777', reason: 'outdated' }]);
  });

  it('refuses a malformed request', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ origin: 'http://localhost:4204', maxSessions: 0 })).status).toBe(400);
    expect((await post({ origin: 'http://localhost:4204', previous: { format: 'other' } })).status).toBe(400);
    expect((await fetch(`${baseUrl}/sessions/golden-set`, { method: 'POST', body: '{' })).status).toBe(400);
  });
});
