import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendContextSession } from './send-context-to-ai.tokens';
import {
  craftWebSocketReplay,
  craftWorkerReplay,
  craftReplayAdapter,
  craftFetchReplay,
  craftXhrReplay,
  craftEventSourceReplay,
  craftSendBeaconReplay,
  captureCraftReplayTransportEvent,
  connectCraftReplayTransportCapture,
  installCraftReplayTransports,
  isCraftReplayTransportEvent,
  provideCraftReplayTransports,
} from './craft-replay-transports';

const originalWebSocket = globalThis.WebSocket;
const originalWorker = globalThis.Worker;
const originalFetch = globalThis.fetch;
const originalXhr = globalThis.XMLHttpRequest;

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.Worker = originalWorker;
  globalThis.fetch = originalFetch;
  globalThis.XMLHttpRequest = originalXhr;
});

describe('custom replay transports', () => {
  it('archives only hook-redacted data and calls the app replay hook', () => {
    const session = createSendContextSession();
    const replayed = vi.fn();
    const adapter = craftReplayAdapter({
      id: 'app:stream',
      match: (url) => url.includes('/stream'),
      record: ({ data }) => ({
        safe: (data as { secret: string }).secret.length,
      }),
      replay: replayed,
    });
    captureCraftReplayTransportEvent(session, adapter, {
      id: 'custom-1',
      url: 'https://example.test/stream?token=secret',
      direction: 'incoming',
      messageType: 'data',
      data: { secret: 'private-value' },
      elapsedMs: 2,
    });
    const events = session.events.filter((event) => event.kind === 'transport');
    expect(JSON.stringify(events)).not.toContain('private-value');
    expect(JSON.stringify(events)).not.toContain('token=secret');
    const replay = installCraftReplayTransports(
      [adapter],
      events,
      () => undefined,
    );
    replay.advanceTo(2);
    expect(replayed).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { safe: 13 },
        messageType: 'data',
      }),
    );
    replay.restore();
  });
});

describe('network coverage and replay guards', () => {
  it('records and replays an adapted direct fetch without calling live fetch twice', async () => {
    const session = createSendContextSession();
    const nativeFetch = vi.fn(
      async () => new Response('live-response', { status: 201 }),
    );
    globalThis.fetch = nativeFetch as typeof fetch;
    const adapter = craftFetchReplay({
      id: 'api:catalog',
      match: (url) => new URL(url).pathname === '/catalog',
      record: ({ direction, data }) =>
        direction === 'incoming'
          ? {
              status: (data as { status: number }).status,
              body: 'sanitized-response',
            }
          : { method: (data as { method: string }).method },
      replay: ({ data }) => {
        const response = data as { status: number; body: string };
        return new Response(response.body, { status: response.status });
      },
    });
    const cleanup = connectCraftReplayTransportCapture(session, [adapter]);
    const live = await fetch('https://example.test/catalog?token=secret');
    expect(live.status).toBe(201);
    cleanup();

    const transportEvents = session.events.filter(
      (event) => event.kind === 'transport',
    );
    expect(transportEvents).toHaveLength(2);
    expect(JSON.stringify(transportEvents)).not.toContain('secret');
    expect(JSON.stringify(transportEvents)).not.toContain('live-response');
    const replay = installCraftReplayTransports(
      [adapter],
      transportEvents,
      () => undefined,
    );
    const result = await fetch('https://example.test/catalog?token=other');
    expect(result.status).toBe(201);
    await expect(result.text()).resolves.toBe('sanitized-response');
    expect(nativeFetch).toHaveBeenCalledOnce();
    replay.restore();
  });

  it('records and replays an adapted direct XHR without sending the replay request', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const originalXhr = g['XMLHttpRequest'];
    const nativeSends: string[] = [];
    class FakeXhr extends EventTarget {
      status = 202;
      statusText = 'Accepted';
      responseText = 'live-xhr-body';
      response: unknown = 'live-xhr-body';
      readyState = 1;
      open(_method: string, _url: string): void {}
      send(): void {
        nativeSends.push('send');
        this.dispatchEvent(new Event('load'));
      }
    }
    g['XMLHttpRequest'] = FakeXhr;
    const adapter = craftXhrReplay({
      id: 'api:xhr',
      match: (url) => new URL(url).pathname === '/xhr',
      record: ({ direction, data }) =>
        direction === 'incoming'
          ? { status: (data as { status: number }).status, body: 'safe-xhr' }
          : { method: (data as { method: string }).method },
      replay: ({ data }) => data,
    });
    const session = createSendContextSession();
    const cleanup = connectCraftReplayTransportCapture(session, [adapter]);
    const live = new XMLHttpRequest();
    live.open('GET', 'https://example.test/xhr?secret=hidden');
    live.send();
    cleanup();
    const events = session.events.filter((event) => event.kind === 'transport');
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('hidden');

    const replay = installCraftReplayTransports(
      [adapter],
      events,
      () => undefined,
    );
    const replayed = new XMLHttpRequest();
    replayed.open('GET', 'https://example.test/xhr?secret=other');
    const loaded = new Promise<void>((resolve) =>
      replayed.addEventListener('load', () => resolve(), { once: true }),
    );
    replayed.send();
    await loaded;
    expect(replayed.status).toBe(202);
    expect(replayed.responseText).toBe('safe-xhr');
    expect(nativeSends).toEqual(['send']);
    replay.restore();
    g['XMLHttpRequest'] = originalXhr;
  });

  it('records EventSource messages and replays them without opening a stream', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const original = g['EventSource'];
    let nativeConnections = 0;
    class FakeEventSource extends EventTarget {
      constructor(readonly url: string) {
        super();
        nativeConnections++;
      }
      close(): void {}
    }
    g['EventSource'] = FakeEventSource;
    const adapter = craftEventSourceReplay({
      id: 'api:events',
      match: (url) => new URL(url).pathname === '/events',
      record: ({ data }) => ({
        safe: String((data as { value: string }).value).toUpperCase(),
      }),
      replay: ({ data }) => (data as { safe: string }).safe,
    });
    const session = createSendContextSession();
    const cleanup = connectCraftReplayTransportCapture(session, [adapter]);
    const live = new EventSource('https://example.test/events?token=secret');
    live.dispatchEvent(
      new MessageEvent('message', { data: { value: 'private' } }),
    );
    cleanup();
    const events = session.events.filter((event) => event.kind === 'transport');
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('secret');
    expect(JSON.stringify(events)).not.toContain('private');

    const replay = installCraftReplayTransports(
      [adapter],
      events,
      () => undefined,
    );
    const replayed = new EventSource('https://example.test/events?token=other');
    const message = new Promise<string>((resolve) =>
      replayed.addEventListener(
        'message',
        (event) => resolve((event as MessageEvent).data),
        { once: true },
      ),
    );
    await expect(message).resolves.toBe('PRIVATE');
    expect(nativeConnections).toBe(1);
    replay.restore();
    g['EventSource'] = original;
  });

  it('records a beacon and replays its adapter hook without calling native sendBeacon', () => {
    const navigatorObject = globalThis.navigator as Navigator &
      Record<string, unknown>;
    const oldBeacon = Object.getOwnPropertyDescriptor(
      navigatorObject,
      'sendBeacon',
    );
    const native = vi.fn(() => true);
    Object.defineProperty(navigatorObject, 'sendBeacon', {
      configurable: true,
      value: native,
    });
    const adapter = craftSendBeaconReplay({
      id: 'api:beacon',
      match: () => true,
      record: ({ data }) => ({ size: String(data).length }),
      replay: () => true,
    });
    const session = createSendContextSession();
    const cleanup = connectCraftReplayTransportCapture(session, [adapter]);
    expect(
      navigator.sendBeacon('https://example.test/finish', 'payload-secret'),
    ).toBe(true);
    cleanup();
    const events = session.events.filter((event) => event.kind === 'transport');
    expect(JSON.stringify(events)).not.toContain('payload-secret');
    const replay = installCraftReplayTransports(
      [adapter],
      events,
      () => undefined,
    );
    expect(
      navigator.sendBeacon('https://example.test/finish', 'other-payload'),
    ).toBe(true);
    expect(native).toHaveBeenCalledOnce();
    replay.restore();
    if (oldBeacon)
      Object.defineProperty(navigatorObject, 'sendBeacon', oldBeacon);
    else Reflect.deleteProperty(navigatorObject, 'sendBeacon');
  });

  it('marks every unadapted browser transport without archiving its URL', async () => {
    const session = createSendContextSession();
    const g = globalThis as unknown as Record<string, unknown>;
    const old = new Map(
      [
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'Worker',
        'EventSource',
        'WebTransport',
      ].map((key) => [key, g[key]]),
    );
    const navigatorObject = globalThis.navigator as Navigator &
      Record<string, unknown>;
    const oldBeacon = Object.getOwnPropertyDescriptor(
      navigatorObject,
      'sendBeacon',
    );
    class FakeXhr {
      open(): void {}
      send(): void {}
    }
    class FakeSocket extends EventTarget {
      send(): void {}
      close(): void {}
    }
    class FakeWorker extends EventTarget {
      postMessage(): void {}
      terminate(): void {}
    }
    class FakeEventSource extends EventTarget {}
    class FakeWebTransport {}
    globalThis.fetch = vi.fn(async () => new Response('ok')) as typeof fetch;
    g['XMLHttpRequest'] = FakeXhr;
    g['WebSocket'] = FakeSocket;
    g['Worker'] = FakeWorker;
    g['EventSource'] = FakeEventSource;
    g['WebTransport'] = FakeWebTransport;
    Object.defineProperty(navigatorObject, 'sendBeacon', {
      configurable: true,
      value: vi.fn(() => true),
    });
    const restore = connectCraftReplayTransportCapture(session, []);
    try {
      await fetch('https://example.test/?token=hidden');
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://example.test/private');
      xhr.send();
      new WebSocket('ws://example.test/private');
      new Worker('https://example.test/private');
      new EventSource('https://example.test/private');
      navigator.sendBeacon('https://example.test/private', 'secret');
      new (g['WebTransport'] as new (url: string) => object)(
        'https://example.test/private',
      );
    } finally {
      restore();
      for (const [key, value] of old) g[key] = value;
      if (oldBeacon)
        Object.defineProperty(navigatorObject, 'sendBeacon', oldBeacon);
      else Reflect.deleteProperty(navigatorObject, 'sendBeacon');
    }
    const coverage = session.events.filter(
      (event) =>
        event.phase === 'failed' && event.name?.startsWith('network-coverage:'),
    );
    expect(coverage.map((event) => event.name).sort()).toEqual([
      'network-coverage:eventsource',
      'network-coverage:fetch',
      'network-coverage:sendBeacon',
      'network-coverage:websocket',
      'network-coverage:webtransport',
      'network-coverage:worker',
      'network-coverage:xhr',
    ]);
    expect(JSON.stringify(coverage)).not.toContain('example.test');
    expect(JSON.stringify(coverage)).not.toContain('hidden');
  });

  it('records a content-free coverage error for direct fetch calls', async () => {
    const session = createSendContextSession();
    const native = vi.fn(async () => new Response('ok'));
    globalThis.fetch = native as typeof fetch;
    delete (globalThis as unknown as Record<string, unknown>)[
      '__craftDebugSessionFetchCaptureInstalled'
    ];
    const restore = connectCraftReplayTransportCapture(session, []);
    await fetch('https://example.test/private?token=hidden');
    restore();
    expect(native).toHaveBeenCalledOnce();
    expect(session.events).toContainEqual(
      expect.objectContaining({
        kind: 'transport',
        phase: 'failed',
        name: 'network-coverage:fetch',
        payload: { api: 'fetch', reason: 'no-recorded-adapter' },
      }),
    );
    expect(JSON.stringify(session.events)).not.toContain('hidden');
  });

  it('blocks unmatched fetch during replay without calling the native fetch', async () => {
    const native = vi.fn(async () => new Response('live'));
    globalThis.fetch = native as typeof fetch;
    const differences: unknown[] = [];
    const replay = installCraftReplayTransports([], [], (difference) =>
      differences.push(difference),
    );
    await expect(fetch('https://example.test/secret')).rejects.toThrow(
      'no live network request was sent',
    );
    expect(native).not.toHaveBeenCalled();
    expect(differences).toHaveLength(1);
    replay.restore();
  });

  it('blocks every supported unmatched API and still advances replay time', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const original = new Map(
      [
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'Worker',
        'EventSource',
        'WebTransport',
      ].map((key) => [key, g[key]]),
    );
    const navigatorObject = globalThis.navigator as Navigator &
      Record<string, unknown>;
    const oldBeacon = Object.getOwnPropertyDescriptor(
      navigatorObject,
      'sendBeacon',
    );
    const nativeCalls: string[] = [];
    class FakeXhr {
      send(): void {
        nativeCalls.push('xhr');
      }
    }
    class FakeSocket extends EventTarget {
      constructor() {
        super();
        nativeCalls.push('websocket');
      }
    }
    class FakeWorker extends EventTarget {
      constructor() {
        super();
        nativeCalls.push('worker');
      }
    }
    class FakeEventSource {
      constructor() {
        nativeCalls.push('eventsource');
      }
    }
    class FakeWebTransport {
      constructor() {
        nativeCalls.push('webtransport');
      }
    }
    globalThis.fetch = vi.fn(async () => {
      nativeCalls.push('fetch');
      return new Response();
    }) as typeof fetch;
    g['XMLHttpRequest'] = FakeXhr;
    g['WebSocket'] = FakeSocket;
    g['Worker'] = FakeWorker;
    g['EventSource'] = FakeEventSource;
    g['WebTransport'] = FakeWebTransport;
    Object.defineProperty(navigatorObject, 'sendBeacon', {
      configurable: true,
      value: () => {
        nativeCalls.push('sendBeacon');
        return true;
      },
    });
    const differences: unknown[] = [];
    const replay = installCraftReplayTransports([], [], (difference) =>
      differences.push(difference),
    );
    try {
      await expect(fetch('https://example.test')).rejects.toThrow();
      expect(() => new XMLHttpRequest().send()).toThrow();
      new WebSocket('ws://example.test');
      new Worker('https://example.test');
      expect(() => new EventSource('https://example.test')).toThrow();
      expect(navigator.sendBeacon('https://example.test')).toBe(false);
      expect(
        () =>
          new (g['WebTransport'] as new (url: string) => object)(
            'https://example.test',
          ),
      ).toThrow();
      replay.advanceTo(100);
      expect(differences.length).toBeGreaterThanOrEqual(7);
      expect(nativeCalls).toEqual([]);
    } finally {
      replay.restore();
      for (const [key, value] of original) g[key] = value;
      if (oldBeacon)
        Object.defineProperty(navigatorObject, 'sendBeacon', oldBeacon);
      else Reflect.deleteProperty(navigatorObject, 'sendBeacon');
    }
  });
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
