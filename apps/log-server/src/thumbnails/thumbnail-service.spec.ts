import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebugSessionStore } from '../debug-session-store.js';
import { createLogHttpServer } from '../http-server.js';
import { LogStore } from '../log-store.js';
import {
  cacheKey,
  ThumbnailCaptureError,
  ThumbnailService,
  type ThumbnailCapturer,
} from './thumbnail-service.js';
import { ThumbnailStore } from './thumbnail-store.js';

const SESSION_ID = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);

describe('thumbnail preparation', () => {
  let directory: string;
  let sessions: DebugSessionStore;
  let store: ThumbnailStore;
  let service: ThumbnailService;
  let server: ReturnType<typeof createLogHttpServer> | undefined;
  let capturerRuns: number;
  let capturer: ThumbnailCapturer;

  async function archive(
    id: string,
    status: 'completed' | 'recording',
    events = 3,
  ): Promise<void> {
    sessions.begin(
      id,
      {
        format: 'craft-debug-session',
        version: 6,
        startUrl: 'http://localhost:4200/',
        exportedAt: Date.now(),
        truncated: false,
        events: [],
        clips: [],
      },
      '2026-10-15T08:00:00.000Z',
      'tab',
      { title: 'Tab', state: 'visible' },
    );
    sessions.appendBatch(
      id,
      Array.from({ length: events }, (_, index) => ({
        id: `e${index}`,
        sequence: index,
        timestamp: 1_000 + index,
        kind: 'dom',
        phase: 'emitted',
      })),
      [],
      false,
      'tab',
    );
    if (status === 'completed') {
      sessions.finishParticipant(id, 'tab', 'completed');
      // The session ends once the reconnect grace period has passed.
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  function build(
    options: {
      withCapturer?: boolean;
      params?: ConstructorParameters<typeof ThumbnailService>[0]['params'];
    } = {},
  ): void {
    service = new ThumbnailService({
      store,
      sessions,
      ...(options.withCapturer === false ? {} : { capturer }),
      ...(options.params ? { params: options.params } : {}),
    });
  }

  async function settled(id: string) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const manifest = service.get(id);
      if (manifest && !['pending', 'running'].includes(manifest.status))
        return manifest;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('thumbnail job did not settle');
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'thumbnails-'));
    sessions = new DebugSessionStore(join(directory, 'sessions'), {
      reconnectGraceMs: 10,
    });
    store = new ThumbnailStore(join(directory, 'sessions', 'thumbnails'));
    capturerRuns = 0;
    capturer = async (_request, sink) => {
      capturerRuns += 1;
      sink.browser('chromium test');
      sink.planned(3);
      sink.frame({
        replayIndex: 0,
        offsetMs: 0,
        reasons: ['start'],
        width: 320,
        height: 200,
        image: WEBP,
      });
      sink.skipped();
      sink.frame({
        replayIndex: 3,
        participantId: 'tab',
        eventId: 'e2',
        offsetMs: 4_000,
        reasons: ['navigation', 'end'],
        width: 320,
        height: 200,
        image: WEBP,
      });
    };
    build();
  });

  afterEach(async () => {
    await service.close();
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    sessions.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('prepares the pictures of a finished session and caches them', async () => {
    await archive(SESSION_ID, 'completed');
    const started = service.start(SESSION_ID);
    expect(['pending', 'running']).toContain(started?.status);

    const manifest = await settled(SESSION_ID);
    expect(manifest).toMatchObject({
      status: 'ready',
      total: 3,
      done: 3,
      browser: 'chromium test',
    });
    expect(manifest.entries.map((entry) => entry.file)).toEqual([
      '000.webp',
      '001.webp',
    ]);
    expect(store.readImage(SESSION_ID, '001.webp')).toEqual(Buffer.from(WEBP));

    // Reopening the session costs nothing: the cache answers.
    expect(service.start(SESSION_ID)?.status).toBe('ready');
    expect(capturerRuns).toBe(1);
    // A forced run replays again.
    service.start(SESSION_ID, { force: true });
    await settled(SESSION_ID);
    expect(capturerRuns).toBe(2);
  });

  it('prepares again when what shapes the pictures changed', async () => {
    await archive(SESSION_ID, 'completed');
    service.start(SESSION_ID);
    await settled(SESSION_ID);
    // Another service on the same cache, with other settings: other pictures.
    await service.close();
    build({ params: { maxPoints: 5 } });
    expect(['pending', 'running']).toContain(service.start(SESSION_ID)?.status);
    await settled(SESSION_ID);
    expect(capturerRuns).toBe(2);
  });

  it('keys the cache on the recording itself', () => {
    const base = {
      format: 'craft-debug-session',
      version: 6,
      startUrl: 'http://localhost:4200/',
      truncated: false,
      events: [{ id: 'a' }],
      clips: [],
    } as const;
    const params = { maxPoints: 20, width: 320, quality: 0.7, quietMs: 400, maxWaitMs: 4000 };
    const key = cacheKey({ ...base, exportedAt: 1 }, params);
    // The export date moves at every read; the content did not change.
    expect(cacheKey({ ...base, exportedAt: 2 }, params)).toBe(key);
    expect(cacheKey({ ...base, exportedAt: 1, events: [{ id: 'a' }, { id: 'b' }] }, params)).not.toBe(key);
  });

  it('does not prepare a session that is still recording', async () => {
    await archive(SESSION_ID, 'recording');
    expect(service.start(SESSION_ID)).toMatchObject({
      status: 'unavailable',
      error: expect.stringContaining('en cours'),
    });
    expect(capturerRuns).toBe(0);
  });

  it('keeps the pictures taken when the replay stops, and says where', async () => {
    await archive(SESSION_ID, 'completed');
    capturer = async (_request, sink) => {
      sink.planned(4);
      sink.frame({
        replayIndex: 0,
        offsetMs: 0,
        reasons: ['start'],
        width: 320,
        height: 200,
        image: WEBP,
      });
      throw new ThumbnailCaptureError('Le replay a divergé.', 5);
    };
    build();
    service.start(SESSION_ID);
    const manifest = await settled(SESSION_ID);
    expect(manifest).toMatchObject({
      status: 'failed',
      error: 'Le replay a divergé.',
      stoppedAtReplayIndex: 5,
    });
    expect(manifest.entries).toHaveLength(1);
  });

  it('reports unavailable when no browser can be driven', async () => {
    await archive(SESSION_ID, 'completed');
    build({ withCapturer: false });
    expect(service.start(SESSION_ID)?.status).toBe('unavailable');
  });

  it('runs one recording at a time and stops a job that is removed', async () => {
    const other = '33e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    await archive(SESSION_ID, 'completed');
    await archive(other, 'completed');
    let release: () => void = () => undefined;
    const order: string[] = [];
    capturer = (request, sink) => {
      order.push(request.sessionId);
      sink.planned(1);
      return new Promise<void>((resolve) => {
        release = resolve;
        request.signal.addEventListener('abort', () => resolve());
      });
    };
    build();
    service.start(SESSION_ID);
    service.start(other);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(order).toEqual([SESSION_ID]);
    expect(service.get(other)?.status).toBe('pending');
    release();
    await settled(SESSION_ID);
    await new Promise((resolve) => setTimeout(resolve, 30));
    release();
    await settled(other);
    expect(order).toEqual([SESSION_ID, other]);

    service.remove(other);
    expect(store.readManifest(other)).toBeUndefined();
  });

  describe('over HTTP', () => {
    let baseUrl: string;

    beforeEach(async () => {
      server = createLogHttpServer({
        store: new LogStore({ directory: join(directory, 'logs') }),
        sessionStore: sessions,
        thumbnails: service,
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, '127.0.0.1', resolve),
      );
      baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
    });

    it('starts, reports, serves and deletes', async () => {
      await archive(SESSION_ID, 'completed');
      const none = await fetch(`${baseUrl}/sessions/${SESSION_ID}/thumbnails`);
      expect(await none.json()).toMatchObject({ status: 'none', entries: [] });

      const started = await fetch(`${baseUrl}/sessions/${SESSION_ID}/thumbnails`, {
        method: 'POST',
      });
      expect(started.status).toBe(202);
      await settled(SESSION_ID);

      const manifest = (await (
        await fetch(`${baseUrl}/sessions/${SESSION_ID}/thumbnails`)
      ).json()) as { status: string; entries: { file: string }[] };
      expect(manifest.status).toBe('ready');

      const image = await fetch(
        `${baseUrl}/sessions/${SESSION_ID}/thumbnails/${manifest.entries[0]!.file}`,
      );
      expect(image.headers.get('content-type')).toBe('image/webp');
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(WEBP);

      const missing = await fetch(
        `${baseUrl}/sessions/${SESSION_ID}/thumbnails/099.webp`,
      );
      expect(missing.status).toBe(404);

      const removed = await fetch(`${baseUrl}/sessions/${SESSION_ID}`, {
        method: 'DELETE',
      });
      expect(removed.status).toBe(200);
      expect(store.readManifest(SESSION_ID)).toBeUndefined();
    });

    it('answers 404 for a session it does not hold', async () => {
      const response = await fetch(
        `${baseUrl}/sessions/${SESSION_ID}/thumbnails`,
        { method: 'POST' },
      );
      expect(response.status).toBe(404);
    });
  });
});
