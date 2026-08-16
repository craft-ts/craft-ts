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
    echoPage(app);
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

    app.close();
    await vi.waitFor(() => expect(broker.clients).toHaveLength(0));
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
    echoPage(replacement);
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

  it('deletes the client card on page/goodbye instead of keeping it reloading', async () => {
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

    app.send(JSON.stringify({ type: 'page/goodbye', clientId: 'app-a' }));
    await vi.waitFor(async () => {
      await expect(broker.request('page')).rejects.toThrow(
        'page client is not connected',
      );
    });
  });

  it('keeps the card reloading when the socket closes without goodbye', async () => {
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

    app.close();
    await expect(
      broker.request('page', { timeoutMs: 80 }),
    ).rejects.toThrow(
      /page reloading since .+s, last url \/login-form, generation 1 → still 1/,
    );
  });

  it('asks the live page even when broker memory is ready', async () => {
    const received: string[] = [];
    app.on('message', (raw) => received.push(raw.toString()));
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      title: 'Login',
      controls: [control('email')],
    });

    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        url: '/login-form',
        title: 'Login',
        status: 'ready',
        controls: [control('email')],
      });
    });
    expect(
      received.filter((message) => message.includes('"method":"page"')).length,
    ).toBeGreaterThan(0);

    livePage = {
      url: '/login-form',
      title: 'Login',
      status: 'ready',
      controls: [control('email'), control('submit')],
    };
    await expect(broker.request('page')).resolves.toMatchObject({
      url: '/login-form',
      controls: [control('email'), control('submit')],
    });
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

  it('uses the ready tab when another card is still reloading', async () => {
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

    app.close();
    await vi.waitFor(() => expect(broker.clients).toHaveLength(0));

    const { port } = broker.address();
    const replacement = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => replacement.once('open', resolve));
    echoPage(replacement);
    replacement.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    publishSurface(replacement, {
      clientId: 'app-b',
      url: '/',
      controls: [control('navToggle')],
    });
    await vi.waitFor(async () => {
      await expect(
        broker.request('page', { clientId: 'app-b' }),
      ).resolves.toMatchObject({ url: '/' });
    });

    await expect(broker.request('page')).resolves.toMatchObject({
      url: '/',
      controls: [expect.objectContaining({ id: 'navToggle' })],
    });
    replacement.close();
  });

  it('requires clientId when two tabs are ready', async () => {
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

    const { port } = broker.address();
    const appB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => appB.once('open', resolve));
    echoPage(appB);
    appB.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    publishSurface(appB, {
      clientId: 'app-b',
      url: '/',
      controls: [control('navToggle')],
    });
    await vi.waitFor(async () => {
      await expect(
        broker.request('page', { clientId: 'app-b' }),
      ).resolves.toMatchObject({ url: '/' });
    });

    await expect(broker.request('page')).rejects.toThrow(
      'Multiple ready page clients; clientId is required. Available clients: app-a ready /login-form, app-b ready /',
    );
    appB.close();
  });

  it('does not wait when several cards are reloading and none is ready', async () => {
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
    const { port } = broker.address();
    const appB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => appB.once('open', resolve));
    appB.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    await vi.waitFor(() => expect(broker.clients.length).toBeGreaterThan(1));
    app.close();
    appB.close();
    await vi.waitFor(() => expect(broker.clients).toHaveLength(0));

    await expect(broker.request('page', { timeoutMs: 80 })).rejects.toThrow(
      /No ready page client\. Reloading: /,
    );
  });

  it('uses the ready tab when another client is still connecting', async () => {
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

    await expect(broker.request('page')).resolves.toMatchObject({
      url: '/login-form',
      controls: [expect.objectContaining({ id: 'email' })],
    });
    appB.close();
  });

  it('rejects page for an unknown client without implying a later tab', async () => {
    await expect(
      broker.request('page', { clientId: 'missing' }),
    ).rejects.toThrow('page client "missing" is not connected');
  });

  it('replies hello/ok with the same clientId when it is not already open', async () => {
    const { port } = broker.address();
    const extra = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => extra.once('open', resolve));
    const assigned = new Promise<string>((resolve) => {
      extra.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as {
          type?: string;
          clientId?: string;
        };
        if (message.type === 'hello/ok' && message.clientId !== undefined) {
          resolve(message.clientId);
        }
      });
    });
    extra.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    await expect(assigned).resolves.toBe('app-b');
    extra.close();
  });

  it('assigns a new clientId when a second socket hellos with an id that is already open', async () => {
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

    const { port } = broker.address();
    const duplicate = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => duplicate.once('open', resolve));
    const assigned = new Promise<string>((resolve) => {
      duplicate.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as {
          type?: string;
          clientId?: string;
        };
        if (message.type === 'hello/ok' && message.clientId !== undefined) {
          resolve(message.clientId);
        }
      });
    });
    duplicate.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-a',
        pageUrl: 'http://localhost/',
      }),
    );
    const newId = await assigned;
    expect(newId).not.toBe('app-a');
    expect(app.readyState).toBe(WebSocket.OPEN);

    echoPage(duplicate);
    publishSurface(duplicate, {
      clientId: newId,
      url: '/',
      controls: [control('navToggle')],
    });

    await expect(
      broker.request('page', { clientId: 'app-a' }),
    ).resolves.toMatchObject({ url: '/login-form' });
    await expect(
      broker.request('page', { clientId: newId }),
    ).resolves.toMatchObject({ url: '/' });
    duplicate.close();
  });

  describe('heartbeat', () => {
    let silent: WebSocket | undefined;

    beforeEach(async () => {
      app.close();
      await broker.close();
      broker = new RegistryBridgeBroker({
        port: 0,
        requestTimeoutMs: 500,
        heartbeatIntervalMs: 30,
        heartbeatTimeoutMs: 80,
      });
      await broker.ready();
    });

    afterEach(() => {
      silent?.close();
    });

    it('marks a client reloading when it stops answering ping', async () => {
      const { port } = broker.address();
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
        autoPong: false,
      });
      silent = socket;
      await new Promise<void>((resolve) => socket.once('open', resolve));
      echoPage(socket);
      socket.send(
        JSON.stringify({
          type: 'hello',
          role: 'registry-app',
          clientId: 'silent',
          pageUrl: 'http://localhost/login-form',
        }),
      );
      publishSurface(socket, {
        clientId: 'silent',
        url: '/login-form',
        controls: [control('email')],
      });
      await vi.waitFor(async () => {
        await expect(
          broker.request('page', { clientId: 'silent' }),
        ).resolves.toMatchObject({ status: 'ready' });
      });

      await vi.waitFor(() => {
        expect(socket.readyState).not.toBe(WebSocket.OPEN);
      });
      await expect(
        broker.request('page', { clientId: 'silent', timeoutMs: 200 }),
      ).rejects.toThrow(/page reloading since /);
    });
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

let livePage: {
  url: string;
  title?: string;
  status: 'ready';
  controls: ReturnType<typeof control>[];
} = { url: '', status: 'ready', controls: [] };

const livePageBySocket = new WeakMap<WebSocket, typeof livePage>();
let lastLivePageSocket: WebSocket | undefined;

function echoPage(socket: WebSocket) {
  socket.on('message', (raw) => {
    const request = JSON.parse(raw.toString()) as {
      callId?: string;
      method?: string;
      params?: { act?: unknown };
    };
    if (request.method !== 'page' || request.callId === undefined) {
      return;
    }
    if (Array.isArray(request.params?.act) && request.params.act.length > 0) {
      return;
    }
    const result =
      socket === lastLivePageSocket
        ? livePage
        : (livePageBySocket.get(socket) ?? livePage);
    socket.send(
      JSON.stringify({
        type: 'response',
        callId: request.callId,
        result,
      }),
    );
  });
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
  livePage = {
    url: surface.url,
    ...(surface.title === undefined ? {} : { title: surface.title }),
    status: 'ready',
    controls: surface.controls,
  };
  lastLivePageSocket = socket;
  livePageBySocket.set(socket, livePage);
  socket.send(
    JSON.stringify({
      type: 'page/surface',
      ...surface,
    }),
  );
}
