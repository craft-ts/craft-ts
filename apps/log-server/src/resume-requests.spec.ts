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
    await post({ sessionId: SESSION, beforeSequence: 40, note: 'éditer le flat white' });
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
      request: { sessionId: SESSION, beforeSequence: 40, note: 'éditer le flat white' },
    });
  });

  it('answers null when nobody asked', async () => {
    const latest = await fetch(`${baseUrl}/sessions/resume-requests/latest`);
    await expect(latest.json()).resolves.toEqual({ request: null });
  });

  it('rejects malformed requests and foreign origins', async () => {
    expect((await post({ sessionId: 'nope' })).status).toBe(400);
    expect((await post({ sessionId: SESSION, beforeSequence: -1 })).status).toBe(400);
    expect(
      (await post({ sessionId: SESSION }, 'https://evil.example')).status,
    ).toBe(403);
    const allowed = await post({ sessionId: SESSION }, 'http://localhost:4210');
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:4210',
    );
  });

  it('keeps only the most recent requests', () => {
    const board = new ResumeRequestBoard(2);
    board.add({ sessionId: SESSION, beforeSequence: 1 });
    board.add({ sessionId: SESSION, beforeSequence: 2 });
    board.add({ sessionId: SESSION, beforeSequence: 3 });
    expect(board.list().map((request) => request.beforeSequence)).toEqual([3, 2]);
  });
});
