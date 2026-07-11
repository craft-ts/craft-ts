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
});
