import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  subject,
} from '@craft-ts/core';
import {
  AjaxError,
  ajax,
  connect,
  fromSubscribable,
  merge,
  of,
  skip,
  take,
  webSocket,
  type CraftStream,
} from '../index';

type Recorded<A> = {
  values: A[];
  errors: unknown[];
  completed: number;
  unsubscribe(): void;
};

function record<A, Y>(stream: CraftStream<A, Y>): Recorded<A> {
  const recorded: Recorded<A> = {
    values: [],
    errors: [],
    completed: 0,
    unsubscribe: () => undefined,
  };
  const subscription = stream.subscribe({
    next: (value) => recorded.values.push(value),
    error: (error) => recorded.errors.push(error),
    complete: () => {
      recorded.completed += 1;
    },
  });
  recorded.unsubscribe = () => subscription.unsubscribe();
  return recorded;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let clock: VirtualCraftTemporalRuntime;
let restoreClock: () => void;

beforeEach(() => {
  clock = new VirtualCraftTemporalRuntime();
  restoreClock = activateCraftTemporalRuntime(clock);
});

afterEach(() => {
  restoreClock();
  vi.unstubAllGlobals();
});

describe('connect', () => {
  it('lets the selector use the shared source several times, subscribing the source once', () => {
    let subscriptions = 0;
    const source = fromSubscribable<number>({
      subscribe: (observer) => {
        subscriptions += 1;
        for (const value of [1, 2, 3, 4, 5, 6]) observer.next?.(value);
        observer.complete?.();
        return { unsubscribe: () => undefined };
      },
    });
    const result = record(
      source.pipe(
        connect((shared) => merge(shared.pipe(take(2)), shared.pipe(skip(4)))),
      ),
    );

    expect(subscriptions).toBe(1);
    expect(result.values).toEqual([1, 2, 5, 6]);
    expect(result.completed).toBe(1);
  });

  it('uses the given connector as the hub', () => {
    const hub = subject<number>();
    const seen: number[] = [];
    hub.subscribe({ next: (value) => seen.push(value) });
    record(
      of(1, 2).pipe(connect((shared) => shared, { connector: () => hub })),
    );

    expect(seen).toEqual([1, 2]);
  });

  it('forwards a source exception and releases the source on unsubscribe', () => {
    const unsubscribed = vi.fn();
    const source = fromSubscribable<number>({
      subscribe: () => ({ unsubscribe: unsubscribed }),
    });
    const result = record(source.pipe(connect((shared) => shared)));
    result.unsubscribe();

    expect(unsubscribed).toHaveBeenCalledOnce();
  });
});

describe('ajax', () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('getJSON emits the parsed body then completes', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse({ id: 1 })));
    vi.stubGlobal('fetch', fetchSpy);
    const result = record(ajax.getJSON<{ id: number }>('/api/1'));
    await settle();

    expect(result.values).toEqual([{ id: 1 }]);
    expect(result.completed).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('ajax(url) emits the response envelope', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(jsonResponse({ ok: true }, 201)),
    );
    const result = record(ajax<{ ok: boolean }>('/x'));
    await settle();

    expect(result.values[0]).toMatchObject({
      status: 201,
      response: { ok: true },
      responseType: 'json',
    });
  });

  it('post sends a plain object as JSON with a content type', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchSpy);
    record(ajax.post('/api', { a: 1 }, { 'X-Test': '1' }));
    await settle();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api',
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        headers: { 'X-Test': '1', 'Content-Type': 'application/json' },
      }),
    );
  });

  it('keeps a Content-Type the caller set, whatever its case', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchSpy);
    record(
      ajax({
        url: '/api',
        method: 'POST',
        body: { a: 1 },
        headers: { 'content-type': 'application/vnd.api+json' },
      }),
    );
    await settle();

    const init = (
      fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>
    )[0][1];
    expect(init.headers).toEqual({
      'content-type': 'application/vnd.api+json',
    });
  });

  it('sends a string or FormData body as it is, with no JSON encoding', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchSpy);
    const form = new FormData();
    form.append('a', '1');
    record(ajax({ url: '/text', method: 'POST', body: 'plain text' }));
    record(ajax({ url: '/form', method: 'POST', body: form }));
    await settle();

    const calls = fetchSpy.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(calls[0][1].body).toBe('plain text');
    expect(calls[1][1].body).toBe(form);
    expect(calls[1][1].headers).toEqual({});
  });

  it('a network failure is a defect, and so is a failing getJSON', async () => {
    const network = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', () => Promise.reject(network));
    const down = record(ajax('/down'));
    const getJson = record(ajax.getJSON('/down'));
    await settle();

    expect(down.errors).toEqual([network]);
    expect(getJson.errors).toEqual([network]);
    expect(down.completed).toBe(0);
  });

  it('put, patch, delete and get use their method', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchSpy);
    record(ajax.put('/a', {}));
    record(ajax.patch('/b', {}));
    record(ajax.delete('/c'));
    record(ajax.get('/d'));
    await settle();

    expect(
      (fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>).map(
        ([, init]) => init.method,
      ),
    ).toEqual(['PUT', 'PATCH', 'DELETE', 'GET']);
  });

  it('an HTTP error status is an AjaxError defect', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(jsonResponse({ message: 'nope' }, 404)),
    );
    const result = record(ajax('/missing'));
    await settle();

    expect(result.errors[0]).toBeInstanceOf(AjaxError);
    expect((result.errors[0] as AjaxError).status).toBe(404);
    expect((result.errors[0] as AjaxError).response).toEqual({
      message: 'nope',
    });
  });

  it('reads text responses and aborts on unsubscribe', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('hello')));
    const text = record(ajax({ url: '/t', responseType: 'text' }));
    await settle();
    expect(text.values[0]).toMatchObject({ response: 'hello' });

    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    });
    const pending = record(ajax('/slow'));
    pending.unsubscribe();
    expect(signal?.aborted).toBe(true);
  });

  it('times out on the temporal runtime', async () => {
    vi.stubGlobal(
      'fetch',
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const result = record(ajax({ url: '/slow', timeout: 100 }));
    await clock.advanceBy(100);
    await settle();

    expect(result.errors[0]).toBeInstanceOf(AjaxError);
    expect(String((result.errors[0] as AjaxError).message)).toMatch(/timeout/);
  });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closed = false;

  constructor(
    readonly url: string,
    readonly protocol?: string | string[],
  ) {
    FakeSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  end(wasClean: boolean) {
    this.readyState = 3;
    this.onclose?.({ wasClean } as CloseEvent);
  }
}

describe('webSocket', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
  });

  const make = <T>() =>
    webSocket<T>({
      url: 'ws://x',
      WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
    });

  it('connects on the first subscriber and delivers parsed messages', () => {
    const socket = make<{ n: number }>();
    expect(FakeSocket.instances).toHaveLength(0);
    const a = record(socket);
    const b = record(socket);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].receive({ n: 1 });

    expect(FakeSocket.instances).toHaveLength(1);
    expect(a.values).toEqual([{ n: 1 }]);
    expect(b.values).toEqual([{ n: 1 }]);
  });

  it('queues sends until the socket is open, then sends them serialized', () => {
    const socket = make<{ n: number }>();
    record(socket);
    socket.next({ n: 1 });
    expect(FakeSocket.instances[0].sent).toEqual([]);
    FakeSocket.instances[0].open();
    socket.next({ n: 2 });

    expect(FakeSocket.instances[0].sent).toEqual(['{"n":1}', '{"n":2}']);
  });

  it('closes the connection when the last subscriber leaves', () => {
    const socket = make<number>();
    const a = record(socket);
    const b = record(socket);
    a.unsubscribe();
    expect(FakeSocket.instances[0].closed).toBe(false);
    b.unsubscribe();

    expect(FakeSocket.instances[0].closed).toBe(true);
  });

  it('a clean close completes, an unclean one is a defect', () => {
    const clean = make<number>();
    const completed = record(clean);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].end(true);
    expect(completed.completed).toBe(1);

    const dirty = make<number>();
    const failed = record(dirty);
    FakeSocket.instances[1].open();
    FakeSocket.instances[1].end(false);
    expect(failed.errors).toHaveLength(1);
  });

  it('reconnects with a fresh socket after it ended', () => {
    const socket = make<number>();
    record(socket);
    FakeSocket.instances[0].end(true);
    const again = record(socket);
    FakeSocket.instances[1].open();
    FakeSocket.instances[1].receive(7);

    expect(FakeSocket.instances).toHaveLength(2);
    expect(again.values).toEqual([7]);
  });

  it('complete() closes the socket and completes the stream', () => {
    const socket = make<number>();
    const result = record(socket);
    socket.complete();

    expect(FakeSocket.instances[0].closed).toBe(true);
    expect(result.completed).toBe(1);
  });

  it('a malformed message is a defect that closes the socket', () => {
    const socket = make<number>();
    const result = record(socket);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].onmessage?.({ data: '{not json' } as MessageEvent);

    expect(result.errors).toHaveLength(1);
    expect(FakeSocket.instances[0].closed).toBe(true);
  });
});
