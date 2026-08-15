import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { RegistryBridgeBroker } from './bridge-broker.js';

describe('RegistryBridgeBroker', () => {
  let broker: RegistryBridgeBroker;
  let app: WebSocket;

  beforeEach(async () => {
    broker = new RegistryBridgeBroker({ port: 0, requestTimeoutMs: 500 });
    await broker.ready();
    const { port } = broker.address();
    app = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => app.once('open', resolve));
    app.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-a',
        pageUrl: 'http://localhost/page-a',
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  afterEach(async () => {
    app.close();
    await broker.close();
  });

  it('tracks registry snapshots', async () => {
    app.send(
      JSON.stringify({
        type: 'registry/snapshot',
        clientId: 'app-a',
        entries: [{ key: 'save', hostName: 'save', ancestry: [] }],
        logs: [
          { id: 1, timestamp: 'now', event: 'registered', message: 'save' },
        ],
      }),
    );

    await vi.waitFor(() =>
      expect(broker.snapshot('app-a').entries).toEqual([
        { key: 'save', hostName: 'save', ancestry: [] },
      ]),
    );
  });

  it('keeps clients and snapshots isolated and requires an explicit target when ambiguous', async () => {
    app.send(
      JSON.stringify({
        type: 'registry/snapshot',
        clientId: 'app-a',
        entries: [{ key: 'page-a' }],
        logs: [],
      }),
    );
    const { port } = broker.address();
    const appB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => appB.once('open', resolve));
    appB.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/page-b',
      }),
    );
    appB.send(
      JSON.stringify({
        type: 'registry/snapshot',
        clientId: 'app-b',
        entries: [{ key: 'page-b' }],
        logs: [],
      }),
    );

    await vi.waitFor(() => expect(broker.clients).toHaveLength(2));
    expect(app.readyState).toBe(WebSocket.OPEN);
    expect(broker.snapshot('app-a').entries).toEqual([{ key: 'page-a' }]);
    expect(broker.snapshot('app-b').entries).toEqual([{ key: 'page-b' }]);
    await expect(broker.request('registry/list')).rejects.toThrow(
      'clientId is required',
    );

    appB.on('message', (rawData) => {
      const request = JSON.parse(rawData.toString()) as { callId: string };
      appB.send(
        JSON.stringify({
          type: 'response',
          callId: request.callId,
          result: 'app-b',
        }),
      );
    });
    await expect(
      broker.request('registry/override', {
        clientId: 'app-b',
        key: 'increment',
        source: '() => undefined',
      }),
    ).resolves.toBe('app-b');

    appB.close();
  });

  it('clears a client snapshot when that same client reconnects', async () => {
    app.send(
      JSON.stringify({
        type: 'registry/snapshot',
        clientId: 'app-a',
        entries: [{ key: 'stale' }],
        logs: [],
      }),
    );
    await vi.waitFor(() =>
      expect(broker.snapshot('app-a').entries).toEqual([{ key: 'stale' }]),
    );

    const { port } = broker.address();
    const replacement = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => replacement.once('open', resolve));
    replacement.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-a',
        pageUrl: 'http://localhost/reloaded',
      }),
    );

    await vi.waitFor(() =>
      expect(broker.snapshot('app-a').entries).toEqual([]),
    );
    replacement.close();
  });

  it('correlates calls and errors by callId', async () => {
    app.on('message', (rawData) => {
      const request = JSON.parse(rawData.toString()) as {
        callId: string;
        method: string;
      };
      app.send(
        JSON.stringify({
          type: 'response',
          callId: request.callId,
          ...(request.method === 'registry/call'
            ? { result: 'called' }
            : { error: { message: 'failed' } }),
        }),
      );
    });

    await expect(
      broker.request('registry/call', { key: 'save', args: [] }),
    ).resolves.toBe('called');
    await expect(
      broker.request('registry/get', { key: 'missing' }),
    ).rejects.toThrow('failed');
  });

  it('keeps the client card on disconnect and times out page with reloading semantics', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      const result = (await broker.request('page')) as { generation: number };
      expect(result.generation).toBe(1);
    });

    app.close();
    await vi.waitFor(() => expect(broker.clients).toHaveLength(0));

    await expect(
      broker.request('page', { timeoutMs: 80 }),
    ).rejects.toThrow(
      /page reloading since .+s, last url \/login-form, generation 1 → still 1/,
    );
  });

  it('waits through reload and returns the new generation without the caller polling', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        generation: 1,
        status: 'ready',
      });
    });

    app.close();
    await vi.waitFor(() => expect(broker.clients).toHaveLength(0));
    const pending = broker.request('page', { timeoutMs: 2_000 });
    const { port } = broker.address();
    const replacement = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => replacement.once('open', resolve));
    replacement.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-a',
        pageUrl: 'http://localhost/login-form',
      }),
    );
    publishSurface(replacement, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email'), control('submit')],
    });

    await expect(pending).resolves.toMatchObject({
      generation: 2,
      status: 'ready',
      url: '/login-form',
      controls: [
        expect.objectContaining({ id: 'email' }),
        expect.objectContaining({ id: 'submit' }),
      ],
    });
    replacement.close();
  });

  it('reads page controls from broker memory when the client is ready', async () => {
    const received: string[] = [];
    app.on('message', (raw) => received.push(raw.toString()));
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      title: 'Login',
      controls: [control('email')],
    });

    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toEqual({
        generation: 1,
        surfaceRev: 1,
        url: '/login-form',
        title: 'Login',
        status: 'ready',
        controls: [control('email')],
      });
    });
    expect(received.filter((message) => message.includes('"method":"page"'))).toEqual(
      [],
    );
  });

  it('forwards page act then returns the browser result', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });

    app.on('message', (rawData) => {
      const request = JSON.parse(rawData.toString()) as {
        callId: string;
        method: string;
        params?: { act?: unknown };
      };
      if (request.method !== 'page') {
        return;
      }
      app.send(
        JSON.stringify({
          type: 'response',
          callId: request.callId,
          result: {
            generation: 1,
            surfaceRev: 2,
            url: '/login-form',
            status: 'ready',
            controls: [{ ...control('email'), value: 'a@b.c' }],
          },
        }),
      );
    });

    await expect(
      broker.request('page', {
        act: [{ id: 'email', fill: 'a@b.c' }],
      }),
    ).resolves.toMatchObject({
      controls: [expect.objectContaining({ id: 'email', value: 'a@b.c' })],
    });
  });

  it('requires clientId for page when several client cards exist', async () => {
    const { port } = broker.address();
    const appB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => appB.once('open', resolve));
    appB.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
      }),
    );
    await vi.waitFor(() => expect(broker.clients).toHaveLength(2));

    await expect(broker.request('page')).rejects.toThrow(
      'Multiple page clients are connected; clientId is required. Available clients: app-a, app-b',
    );
    appB.close();
  });

  it('rejects page for an unknown client without implying a later tab', async () => {
    await expect(
      broker.request('page', { clientId: 'missing' }),
    ).rejects.toThrow('page client "missing" is not connected');
  });
});

function control(id: string) {
  return {
    id,
    role: id === 'submit' ? 'button' : 'textbox',
    name: id,
    enabled: true,
    index: 0,
  };
}

function publishSurface(
  socket: WebSocket,
  surface: {
    clientId: string;
    url: string;
    title?: string;
    controls: ReturnType<typeof control>[];
  },
): void {
  socket.send(
    JSON.stringify({
      type: 'page/surface',
      ...surface,
    }),
  );
}
