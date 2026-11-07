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

  const record = (id: string, startUrl: string, events: Record<string, unknown>[]) => {
    sessionStore.begin(id, {
      format: 'craft-debug-session', version: 6, startUrl, exportedAt: 0, truncated: false, events, clips: [],
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

  it('refuses a malformed request', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ origin: 'http://localhost:4204', maxSessions: 0 })).status).toBe(400);
    expect((await post({ origin: 'http://localhost:4204', previous: { format: 'other' } })).status).toBe(400);
    expect((await fetch(`${baseUrl}/sessions/golden-set`, { method: 'POST', body: '{' })).status).toBe(400);
  });
});
