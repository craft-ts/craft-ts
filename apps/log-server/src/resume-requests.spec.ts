import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { ResumeRequestBoard } from './resume-requests.js';

const SESSION = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const REQUEST = '00000000-0000-4000-8000-000000000003';

describe('resume requests', () => {
  let directory: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'resume-requests-'));
    server = createLogHttpServer({ store: new LogStore({ directory }) });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  function post(body: unknown, origin?: string): Promise<Response> {
    return fetch(`${baseUrl}/sessions/resume-requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('hands the latest request over, optionally for one session', async () => {
    await post({
      sessionId: SESSION,
      beforeSequence: 40,
      note: 'éditer le flat white',
    });
    const created = await post({ sessionId: OTHER });
    expect(created.status).toBe(201);

    const latest = await fetch(`${baseUrl}/sessions/resume-requests/latest`);
    await expect(latest.json()).resolves.toMatchObject({
      request: { sessionId: OTHER },
    });
    const forSession = await fetch(
      `${baseUrl}/sessions/resume-requests/latest?sessionId=${SESSION}`,
    );
    await expect(forSession.json()).resolves.toMatchObject({
      request: {
        sessionId: SESSION,
        beforeSequence: 40,
        note: 'éditer le flat white',
      },
    });
  });

  it('keeps a client request id stable and reads that exact request', async () => {
    const first = await post({
      id: REQUEST,
      sessionId: SESSION,
      beforeSequence: 40,
    });
    expect(first.status).toBe(201);
    const created = (await first.json()) as {
      request: { id: string; createdAt: string };
    };
    expect(created.request.id).toBe(REQUEST);

    const retried = await post({
      id: REQUEST,
      sessionId: SESSION,
      beforeSequence: 40,
    });
    expect(retried.status).toBe(201);
    await expect(retried.json()).resolves.toMatchObject({
      request: created.request,
    });

    const exact = await fetch(`${baseUrl}/sessions/resume-requests/${REQUEST}`);
    await expect(exact.json()).resolves.toMatchObject({
      request: { id: REQUEST, sessionId: SESSION, beforeSequence: 40 },
      messages: [],
    });

    const conflictingRetry = await post({ id: REQUEST, sessionId: OTHER });
    expect(conflictingRetry.status).toBe(409);
    expect(
      (await fetch(`${baseUrl}/sessions/resume-requests/${OTHER}`)).status,
    ).toBe(404);
  });

  it('answers null when nobody asked', async () => {
    const latest = await fetch(`${baseUrl}/sessions/resume-requests/latest`);
    await expect(latest.json()).resolves.toEqual({
      request: null,
      messages: [],
    });
  });

  it('rejects malformed requests and foreign origins', async () => {
    expect((await post({ sessionId: 'nope' })).status).toBe(400);
    expect(
      (await post({ sessionId: SESSION, beforeSequence: -1 })).status,
    ).toBe(400);
    expect(
      (await post({ sessionId: SESSION }, 'https://evil.example')).status,
    ).toBe(403);
    const allowed = await post({ sessionId: SESSION }, 'http://localhost:4210');
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:4210',
    );
  });

  it('keeps a thread per request, readable from the latest request or since a message', async () => {
    const created = (await (await post({ sessionId: SESSION })).json()) as {
      request: { id: string };
    };
    const thread = `${baseUrl}/sessions/resume-requests/${created.request.id}/messages`;
    const say = (body: unknown) =>
      fetch(thread, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const first = (await (
      await say({ from: 'ai', text: 'J’ouvre l’app sur /admin.' })
    ).json()) as { message: { id: number } };
    await say({
      from: 'ai',
      kind: 'handoff',
      text: 'À vous : connectez-vous.',
    });
    await say({ from: 'person', text: 'C’est fait.' });

    const latest = (await (
      await fetch(
        `${baseUrl}/sessions/resume-requests/latest?sessionId=${SESSION}`,
      )
    ).json()) as {
      messages: { from: string; kind: string }[];
    };
    expect(
      latest.messages.map((message) => [message.from, message.kind]),
    ).toEqual([
      ['ai', 'step'],
      ['ai', 'handoff'],
      ['person', 'reply'],
    ]);
    const since = (await (
      await fetch(`${thread}?since=${first.message.id}`)
    ).json()) as { messages: unknown[] };
    expect(since.messages).toHaveLength(2);

    expect((await say({ from: 'robot', text: 'x' })).status).toBe(400);
    expect((await say({ from: 'ai', text: '   ' })).status).toBe(400);
    const unknown = await fetch(
      `${baseUrl}/sessions/resume-requests/${OTHER}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: 'ai', text: 'perdu' }),
      },
    );
    expect(unknown.status).toBe(404);
  });

  it('keeps only the most recent requests', () => {
    const board = new ResumeRequestBoard(2);
    board.add({ sessionId: SESSION, beforeSequence: 1 });
    board.add({ sessionId: SESSION, beforeSequence: 2 });
    board.add({ sessionId: SESSION, beforeSequence: 3 });
    expect(board.list().map((request) => request.beforeSequence)).toEqual([
      3, 2,
    ]);
  });
});
