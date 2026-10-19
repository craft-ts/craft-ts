import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { DebugSessionStore } from './debug-session-store.js';

describe('debug session local archive API', () => {
  let directory: string;
  let server: ReturnType<typeof createLogHttpServer>;
  let baseUrl: string;
  let socket: WebSocket | undefined;
  let sessionStore: DebugSessionStore;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'debug-session-http-'));
    sessionStore = new DebugSessionStore(join(directory, 'sessions'), {
      reconnectGraceMs: 200,
    });
    server = createLogHttpServer({
      store: new LogStore({ directory: join(directory, 'logs') }),
      sessionStore,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      const closed = once(socket, 'close');
      socket.close();
      await closed;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sessionStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('streams events to disk and serves a selectable session export', async () => {
    const id = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    const wsUrl = baseUrl.replace('http:', 'ws:') + '/sessions/ws';
    socket = new WebSocket(wsUrl, { origin: 'http://localhost:4200' });
    await once(socket, 'open');

    const ready = onceJson(socket);
    socket.send(
      JSON.stringify({
        type: 'session:sync',
        id,
        participantId: 'tab-profile',
        createdAt: '2026-10-15T08:00:00.000Z',
        participant: {
          title: 'Demo tab',
          state: 'visible',
          environment: {
            browser: 'Firefox',
            browserVersion: '128.0',
            engine: 'gecko',
            userAgent: 'Mozilla/5.0 Firefox/128.0',
            platform: 'MacIntel',
            devicePixelRatio: 2,
            language: 'fr-FR',
            timeZone: 'Europe/Paris',
          },
        },
        session: {
          format: 'craft-debug-session',
          version: 5,
          startUrl: 'http://localhost:4200/',
          exportedAt: Date.now(),
          truncated: false,
          initialSnapshot: { count: 0 },
          events: [],
          clips: [
            {
              id: 'clip-1',
              label: 'Application session',
              startedAt: Date.now(),
              eventIds: [],
            },
          ],
        },
      }),
    );
    await expect(ready).resolves.toMatchObject({ type: 'session:ready', id });

    const savedEvent = onceJson(socket);
    socket.send(
      JSON.stringify({
        type: 'session:event',
        id,
        clips: [
          {
            id: 'clip-1',
            label: 'Application session',
            startedAt: Date.now(),
            eventIds: ['event-1'],
          },
        ],
        truncated: false,
        event: {
          id: 'event-1',
          sequence: 1,
          timestamp: Date.now(),
          elapsedMs: 5,
          kind: 'dom',
          phase: 'emitted',
          name: 'click',
        },
      }),
    );
    await expect(savedEvent).resolves.toMatchObject({
      type: 'session:event-saved',
      sequence: 1,
    });

    const savedBatch = onceJson(socket);
    socket.send(
      JSON.stringify({
        type: 'session:events',
        id,
        participantId: 'tab-a',
        truncated: false,
        clips: [],
        events: [2, 3].map((sequence) => ({
          id: `event-${sequence}`,
          sequence,
          timestamp: Date.now(),
          kind: 'craft',
          phase: 'started',
        })),
      }),
    );
    await expect(savedBatch).resolves.toMatchObject({
      type: 'session:events-saved',
      id,
    });

    const list = await fetch(`${baseUrl}/sessions`).then((response) =>
      response.json(),
    );
    expect(list.sessions).toMatchObject([
      { id, status: 'recording', eventCount: 3 },
    ]);
    const loaded = await fetch(`${baseUrl}/sessions/${id}`).then((response) =>
      response.json(),
    );
    expect(loaded).toMatchObject({
      format: 'craft-debug-session',
      initialSnapshot: { count: 0 },
      participants: [
        {
          id: 'tab-profile',
          environment: {
            browser: 'Firefox',
            browserVersion: '128.0',
            engine: 'gecko',
            platform: 'MacIntel',
            devicePixelRatio: 2,
            language: 'fr-FR',
            timeZone: 'Europe/Paris',
          },
        },
      ],
    });
    expect(loaded.events[0]).toMatchObject({ id: 'event-1', kind: 'dom' });
    expect(loaded.events).toHaveLength(3);

    const finished = onceJson(socket);
    socket.send(JSON.stringify({ type: 'session:finish', id }));
    await expect(finished).resolves.toMatchObject({
      type: 'session:saved',
      id,
    });
  });

  it('recovers a disconnected page finish through the keepalive endpoint', async () => {
    const id = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    const participantId = 'tab-finish';
    const wsUrl = baseUrl.replace('http:', 'ws:') + '/sessions/ws';
    socket = new WebSocket(wsUrl, { origin: 'http://localhost:4200' });
    await once(socket, 'open');
    const ready = onceJson(socket);
    socket.send(JSON.stringify(syncMessage(id, participantId, 'event-a')));
    await ready;

    const response = await fetch(`${baseUrl}/sessions/${id}/finish`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'text/plain;charset=UTF-8',
      },
      body: JSON.stringify({
        participantId,
        clips: [
          {
            id: 'clip-final',
            participantId,
            label: 'final clip',
            startedAt: Date.now(),
            eventIds: [],
          },
        ],
        truncated: false,
      }),
    });
    expect(response.status).toBe(202);
    const closed = once(socket, 'close');
    socket.close();
    await closed;
    await new Promise((resolve) => setTimeout(resolve, 250));

    const archived = await fetch(`${baseUrl}/sessions/${id}`).then((res) =>
      res.json(),
    );
    expect(sessionStore.list()).toMatchObject([{ id, status: 'completed' }]);
    expect(archived.participants).toMatchObject([
      { id: participantId, status: 'completed' },
    ]);
    expect(archived.clips).toContainEqual(
      expect.objectContaining({ id: 'clip-final', participantId }),
    );
  });

  it('merges same-session participants and finishes only after the last tab leaves', async () => {
    const id = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    const wsUrl = baseUrl.replace('http:', 'ws:') + '/sessions/ws';
    const first = new WebSocket(wsUrl, { origin: 'http://localhost:4200' });
    const second = new WebSocket(wsUrl, { origin: 'http://localhost:4200' });
    socket = first;
    await Promise.all([once(first, 'open'), once(second, 'open')]);

    const createReady = onceJson(first);
    first.send(JSON.stringify(syncMessage(id, 'tab-a', 'event-a')));
    await expect(createReady).resolves.toMatchObject({
      type: 'session:ready',
      id,
      participantId: 'tab-a',
    });

    const joinReady = onceJson(second);
    second.send(JSON.stringify(syncMessage(id, 'tab-b', 'event-b')));
    await expect(joinReady).resolves.toMatchObject({
      type: 'session:ready',
      id,
      participantId: 'tab-b',
    });

    const exportResponse = await fetch(`${baseUrl}/sessions/${id}`).then(
      (response) => response.json(),
    );
    expect(exportResponse).toMatchObject({
      events: [
        { id: 'event-a', participantId: 'tab-a', participantSequence: 1 },
        { id: 'event-b', participantId: 'tab-b', participantSequence: 1 },
      ],
      participants: [
        { id: 'tab-a', state: 'visible' },
        { id: 'tab-b', state: 'visible' },
      ],
    });

    const firstFinished = onceJson(first);
    first.send(
      JSON.stringify({ type: 'session:finish', id, participantId: 'tab-a' }),
    );
    await expect(firstFinished).resolves.toMatchObject({
      type: 'session:saved',
      status: 'recording',
    });
    expect(sessionStore.list()[0]?.status).toBe('recording');

    const secondFinished = onceJson(second);
    second.send(
      JSON.stringify({ type: 'session:finish', id, participantId: 'tab-b' }),
    );
    await expect(secondFinished).resolves.toMatchObject({
      type: 'session:saved',
      status: 'recording',
    });

    const third = new WebSocket(wsUrl, { origin: 'http://localhost:4200' });
    socket = third;
    await once(third, 'open');
    const rejoined = onceJson(third);
    third.send(JSON.stringify(syncMessage(id, 'tab-c', 'event-c')));
    await expect(rejoined).resolves.toMatchObject({
      type: 'session:ready',
      id,
      participantId: 'tab-c',
    });
    expect(sessionStore.get(id)?.events).toHaveLength(3);
    expect(sessionStore.list()[0]?.status).toBe('recording');

    const thirdFinished = onceJson(third);
    third.send(
      JSON.stringify({ type: 'session:finish', id, participantId: 'tab-c' }),
    );
    await thirdFinished;
    await expect.poll(() => sessionStore.list()[0]?.status).toBe('completed');
    second.close();
  });

  it('rejects websocket origins outside loopback', async () => {
    const denied = new WebSocket(
      baseUrl.replace('http:', 'ws:') + '/sessions/ws',
      { origin: 'https://example.com' },
    );
    await expect(once(denied, 'open')).rejects.toBeDefined();
    denied.close();
  });

  it('does not expose the session index to remote browser origins', async () => {
    const response = await fetch(`${baseUrl}/sessions`, {
      headers: { origin: 'https://example.com' },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows the dashboard to delete an archived session', async () => {
    const id = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    sessionStore.begin(
      id,
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost:4200/',
        exportedAt: Date.now(),
        truncated: false,
        events: [],
        clips: [],
      },
      new Date().toISOString(),
    );

    const response = await fetch(`${baseUrl}/sessions/${id}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost:4210' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:4210',
    );
    expect(sessionStore.get(id)).toBeUndefined();
  });

  it('rejects session deletion from an unlisted browser origin', async () => {
    const id = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    sessionStore.begin(
      id,
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost:4200/',
        exportedAt: Date.now(),
        truncated: false,
        events: [],
        clips: [],
      },
      new Date().toISOString(),
    );

    const response = await fetch(`${baseUrl}/sessions/${id}`, {
      method: 'DELETE',
      headers: { origin: 'https://example.com' },
    });

    expect(response.status).toBe(403);
    expect(sessionStore.get(id)).toBeDefined();
  });
});

function once(socket: WebSocket, eventName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once(eventName, resolve);
    socket.once('error', reject);
  });
}

function onceJson(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
  });
}

function syncMessage(id: string, participantId: string, eventId: string) {
  return {
    type: 'session:sync',
    id,
    participantId,
    createdAt: '2026-10-15T08:00:00.000Z',
    participant: {
      startUrl: `http://localhost:4200/${participantId}`,
      viewport: { width: 390, height: 844 },
      state: 'visible',
    },
    session: {
      format: 'craft-debug-session',
      version: 5,
      startUrl: `http://localhost:4200/${participantId}`,
      viewport: { width: 390, height: 844 },
      exportedAt: Date.now(),
      truncated: false,
      events: [
        {
          id: eventId,
          sequence: 1,
          timestamp: Date.now(),
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          name: 'click',
          payload: { selector: '#button', action: 'click' },
        },
      ],
      clips: [],
    },
  };
}
