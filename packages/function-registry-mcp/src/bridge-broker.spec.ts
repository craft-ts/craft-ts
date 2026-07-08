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
    app.send(JSON.stringify({ type: 'hello', role: 'registry-app' }));
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
        entries: [{ key: 'save', hostName: 'save', ancestry: [] }],
        logs: [
          { id: 1, timestamp: 'now', event: 'registered', message: 'save' },
        ],
      }),
    );

    await vi.waitFor(() =>
      expect(broker.snapshot.entries).toEqual([
        { key: 'save', hostName: 'save', ancestry: [] },
      ]),
    );
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
