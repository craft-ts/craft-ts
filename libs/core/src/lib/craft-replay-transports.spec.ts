import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendContextSession } from './send-context-to-ai.tokens';
import {
  craftWebSocketReplay,
  craftWorkerReplay,
  connectCraftReplayTransportCapture,
  installCraftReplayTransports,
  isCraftReplayTransportEvent,
  provideCraftReplayTransports,
} from './craft-replay-transports';

const originalWebSocket = globalThis.WebSocket;
const originalWorker = globalThis.Worker;

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.Worker = originalWorker;
});

describe('replay transport definitions', () => {
  it('rejects invalid and duplicate adapter ids', () => {
    expect(() =>
      craftWebSocketReplay({ id: 'bad id', match: () => true }),
    ).toThrow();
    const definition = craftWebSocketReplay({
      id: 'socket',
      match: () => true,
    });
    expect(() => provideCraftReplayTransports(definition, definition)).toThrow(
      'Duplicate replay transport id: socket',
    );
  });

  it('validates transport identity, sequence, direction and codec shape', () => {
    const event = {
      transportId: 'notifications',
      transport: 'websocket',
      instanceId: 'socket-1',
      direction: 'incoming',
      messageType: 'message',
      sequence: 1,
      elapsedMs: 2,
      data: { codec: 'text', value: 'hello' },
      replayable: true,
    };
    expect(isCraftReplayTransportEvent(event)).toBe(true);
    expect(isCraftReplayTransportEvent({ ...event, sequence: -1 })).toBe(false);
    expect(
      isCraftReplayTransportEvent({ ...event, direction: 'sideways' }),
    ).toBe(false);
    expect(
      isCraftReplayTransportEvent({
        ...event,
        data: { codec: 'base64', value: 3 },
      }),
    ).toBe(false);
  });

  it('captures declared WebSocket lifecycle and frames, then replays them without a native socket', async () => {
    class FakeWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readonly url: string;
      readonly protocol = '';
      readonly extensions = '';
      readonly bufferedAmount = 0;
      binaryType: BinaryType = 'blob';
      readyState = 0;
      constructor(url: string) {
        super();
        this.url = url;
      }
      send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        this.readyState = 1;
      }
      close(): void {
        this.readyState = 3;
      }
    }
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const nativeConstruct = vi.fn((url: string) => new FakeWebSocket(url));
    const Original = globalThis.WebSocket;
    globalThis.WebSocket = new Proxy(Original, {
      construct: (_target, args) => nativeConstruct(String(args[0])),
    });
    const session = createSendContextSession();
    const definition = craftWebSocketReplay({
      id: 'notifications',
      match: (url) => new URL(url).pathname === '/api/notifications',
    });
    const cleanup = connectCraftReplayTransportCapture(session, [definition]);
    const socket = new WebSocket(
      'ws://localhost/api/notifications?token=secret',
    ) as unknown as FakeWebSocket;
    socket.dispatchEvent(new Event('open'));
    socket.send('ping');
    socket.send(new Uint8Array([1, 2]));
    socket.dispatchEvent(new MessageEvent('message', { data: 'pong' }));
    socket.dispatchEvent(
      new MessageEvent('message', { data: new Uint8Array([3, 4]) }),
    );
    socket.dispatchEvent(
      new CloseEvent('close', { code: 1000, reason: 'done', wasClean: true }),
    );
    cleanup();

    const payloads = session.events
      .map((event) => event.payload)
      .filter(isCraftReplayTransportEvent);
    expect(payloads.map((event) => event.messageType)).toEqual([
      'created',
      'open',
      'message',
      'message',
      'message',
      'message',
      'close',
    ]);
    expect(payloads[0]?.metadata?.['url']).toBe(
      'ws://localhost/api/notifications',
    );
    expect(payloads[1]?.direction).toBe('lifecycle');
    expect(payloads[2]).toMatchObject({
      direction: 'outgoing',
      data: { codec: 'text', value: 'ping' },
    });
    expect(payloads[3]).toMatchObject({
      direction: 'outgoing',
      data: { codec: 'base64', value: 'AQI=' },
    });
    expect(payloads[4]).toMatchObject({
      direction: 'incoming',
      data: { codec: 'text', value: 'pong' },
    });
    expect(payloads[5]).toMatchObject({
      direction: 'incoming',
      data: { codec: 'base64', value: 'AwQ=' },
    });

    const replayEvents = session.events;
    const difference = vi.fn();
    const replay = installCraftReplayTransports(
      [definition],
      replayEvents,
      difference,
    );
    const replaySocket = new WebSocket(
      'ws://localhost/api/notifications?token=other',
    ) as unknown as FakeWebSocket;
    expect(replaySocket).toBeInstanceOf(WebSocket);
    const messages: unknown[] = [];
    replaySocket.addEventListener('open', () => {
      replaySocket.send('ping');
      replaySocket.send(new Uint8Array([1, 2]));
    });
    replaySocket.addEventListener('message', (event) =>
      messages.push(
        (event as MessageEvent).data instanceof ArrayBuffer
          ? Array.from(
              new Uint8Array((event as MessageEvent).data as ArrayBuffer),
            )
          : (event as MessageEvent).data,
      ),
    );
    replay.advanceTo(Number.MAX_SAFE_INTEGER);
    await Promise.resolve();
    expect(messages).toEqual(['pong', [3, 4]]);
    expect(nativeConstruct).toHaveBeenCalledTimes(1);
    expect(difference).not.toHaveBeenCalled();
    replay.restore();

    const captureLarge = connectCraftReplayTransportCapture(session, [
      definition,
    ]);
    const large = new WebSocket(
      'ws://localhost/api/notifications',
    ) as unknown as FakeWebSocket;
    large.send('x'.repeat(1_048_577));
    captureLarge();
    expect(
      session.events
        .map((event) => event.payload)
        .filter(isCraftReplayTransportEvent)
        .at(-1),
    ).toMatchObject({ replayable: false, reason: 'message-too-large' });
    session.destroy();
  });

  it('captures worker messages and marks transfer detachment unsupported', () => {
    class FakeWorker extends EventTarget {
      onmessage: ((event: MessageEvent) => unknown) | null = null;
      onmessageerror: ((event: MessageEvent) => unknown) | null = null;
      onerror: ((event: ErrorEvent) => unknown) | null = null;
      constructor(readonly scriptURL: string) {
        super();
      }
      postMessage(_message: unknown, _transfer?: Transferable[]): void {}
      terminate(): void {}
    }
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const session = createSendContextSession();
    const definition = craftWorkerReplay({
      id: 'search-index',
      match: (url) => url.endsWith('/search.worker.js'),
    });
    const cleanup = connectCraftReplayTransportCapture(session, [definition]);
    const worker = new Worker('/search.worker.js') as unknown as FakeWorker;
    worker.postMessage({ query: 'craft' });
    worker.postMessage({ bytes: 1 }, [{} as Transferable]);
    worker.dispatchEvent(new MessageEvent('message', { data: ['result'] }));
    worker.terminate();
    cleanup();
    const payloads = session.events
      .map((event) => event.payload)
      .filter(isCraftReplayTransportEvent);
    expect(payloads).toContainEqual(
      expect.objectContaining({
        direction: 'outgoing',
        data: { codec: 'json', value: { query: 'craft' } },
      }),
    );
    expect(payloads).toContainEqual(
      expect.objectContaining({
        replayable: false,
        reason: 'transfer-detachment-unsupported',
      }),
    );
    expect(payloads.at(-1)).toMatchObject({
      direction: 'lifecycle',
      messageType: 'terminate',
    });
    session.destroy();
  });

  it('replays a worker with recorded messages and never calls the native constructor', async () => {
    class FakeWorker extends EventTarget {
      onmessage: ((event: MessageEvent) => unknown) | null = null;
      onmessageerror: ((event: MessageEvent) => unknown) | null = null;
      onerror: ((event: ErrorEvent) => unknown) | null = null;
      constructor(readonly scriptURL: string) {
        super();
      }
      postMessage(_message: unknown, _transfer?: Transferable[]): void {}
      terminate(): void {}
    }
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const nativeConstructor = vi.fn((url: string) => new FakeWorker(url));
    globalThis.Worker = new Proxy(globalThis.Worker, {
      construct: (_target, args) => nativeConstructor(String(args[0])),
    });
    const session = createSendContextSession();
    const definition = craftWorkerReplay({
      id: 'search-index',
      match: (url) => url.endsWith('/search.worker.js'),
    });
    const cleanup = connectCraftReplayTransportCapture(session, [definition]);
    const recordedWorker = new Worker(
      '/search.worker.js',
    ) as unknown as FakeWorker;
    recordedWorker.postMessage({ query: 'craft' });
    recordedWorker.dispatchEvent(
      new MessageEvent('message', { data: { ids: ['craft-ts'] } }),
    );
    recordedWorker.terminate();
    cleanup();

    const replay = installCraftReplayTransports(
      [definition],
      session.events,
      vi.fn(),
    );
    const replayWorker = new Worker(
      '/search.worker.js',
    ) as unknown as FakeWorker;
    expect(replayWorker).toBeInstanceOf(Worker);
    const received: unknown[] = [];
    replayWorker.addEventListener('message', (event) =>
      received.push((event as MessageEvent).data),
    );
    replayWorker.postMessage({ query: 'craft' });
    replay.advanceTo(Number.MAX_SAFE_INTEGER);
    await Promise.resolve();
    replayWorker.terminate();
    replay.assertComplete();

    expect(received).toEqual([{ ids: ['craft-ts'] }]);
    expect(nativeConstructor).toHaveBeenCalledTimes(1);
    replay.restore();
    session.destroy();
  });
});
