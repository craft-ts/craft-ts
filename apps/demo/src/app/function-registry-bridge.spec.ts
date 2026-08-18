// @vitest-environment jsdom
import {
  createFunctionRegistryClientId,
  handleFunctionRegistryRequest,
  nextReconnectDelayMs,
  persistAssignedClientId,
  respondToBridgeMessage,
  shouldSendGoodbye,
  startFunctionRegistryBridge,
  type RegistryBridgeRequest,
  type RegistryBridgeSocket,
} from './function-registry-bridge';
import { createFunctionRegistry } from './function-registry';
import type {
  PrimitiveResourceRuntimeContext,
  StateMethodRuntimeContext,
} from '@craft-ng/core';
import {
  TestBed,
  ɵInjector as Injector,
  ɵrunInInjectionContext as runInInjectionContext,
} from '@craft-ng/core';

describe('function registry WebSocket bridge', () => {
  it('keeps a stable client id in tab storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(createFunctionRegistryClientId(storage, () => 'generated-a')).toBe(
      'generated-a',
    );
    expect(createFunctionRegistryClientId(storage, () => 'generated-b')).toBe(
      'generated-a',
    );
  });

  it('persists a broker-assigned client id', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const first = createFunctionRegistryClientId(storage, () => 'original-id');
    persistAssignedClientId(storage, 'assigned-id');
    expect(first).toBe('original-id');
    expect(createFunctionRegistryClientId(storage, () => 'other')).toBe(
      'assigned-id',
    );
  });

  it('sends goodbye only when the tab is discarded, not when it is frozen', () => {
    expect(shouldSendGoodbye({ persisted: false })).toBe(true);
    expect(shouldSendGoodbye({ persisted: true })).toBe(false);
  });

  it('backs off reconnect delay up to 10s', () => {
    expect(nextReconnectDelayMs(0, () => 0)).toBe(1000);
    expect(nextReconnectDelayMs(1, () => 0)).toBe(2000);
    expect(nextReconnectDelayMs(4, () => 0)).toBe(10000);
    expect(nextReconnectDelayMs(8, () => 0)).toBe(10000);
  });

  it('transmits the registry list with the callId', async () => {
    const registry = createFunctionRegistry();
    registry.register('save', ['Editor'], () => undefined);
    const sent: string[] = [];

    await respondToBridgeMessage(
      { send: (message) => sent.push(message) },
      JSON.stringify(request('list-1', 'registry/list')),
      registry,
    );

    expect(JSON.parse(sent[0] ?? '')).toEqual({
      type: 'response',
      callId: 'list-1',
      result: [
        {
          key: 'save <= Editor',
          hostName: 'save',
          ancestry: ['Editor'],
          capabilities: [],
          overrideActive: false,
        },
      ],
    });
  });

  it('transmits an invocation and its result', async () => {
    const registry = createFunctionRegistry();
    const fn = vi.fn((value: unknown) => `received:${String(value)}`);
    registry.register('send', [], fn);
    const sent: string[] = [];

    await respondToBridgeMessage(
      { send: (message) => sent.push(message) },
      JSON.stringify(
        request('call-1', 'registry/call', { key: 'send', args: [42] }),
      ),
      registry,
    );

    expect(fn).toHaveBeenCalledWith(42);
    expect(JSON.parse(sent[0] ?? '')).toEqual({
      type: 'response',
      callId: 'call-1',
      result: 'received:42',
    });
  });

  it('transmits execution errors without losing the callId', async () => {
    const registry = createFunctionRegistry();
    registry.register('explode', [], () => {
      throw new Error('boom');
    });
    const sent: string[] = [];

    await respondToBridgeMessage(
      { send: (message) => sent.push(message) },
      JSON.stringify(request('call-2', 'registry/call', { key: 'explode' })),
      registry,
    );

    expect(JSON.parse(sent[0] ?? '')).toEqual({
      type: 'response',
      callId: 'call-2',
      error: { message: 'boom' },
    });
  });

  it('filters observable logs by id', async () => {
    const registry = createFunctionRegistry();
    registry.register('first', [], () => undefined);
    const currentLogs = registry.logs();
    const firstId = currentLogs[currentLogs.length - 1]?.id ?? 0;
    registry.register('second', [], () => undefined);

    const logs = await handleFunctionRegistryRequest(
      request('logs-1', 'registry/logs', { sinceId: firstId }),
      registry,
    );

    expect(logs).toEqual([
      expect.objectContaining({ event: 'registered', key: 'second' }),
    ]);
  });

  it('installs and restores a runtime override', async () => {
    const registry = createFunctionRegistry();
    const state = createStateContext(0);
    registry.register('increment', [], () => undefined, state);

    const installed = await handleFunctionRegistryRequest(
      request('override-1', 'registry/override', {
        key: 'increment',
        source: '({ state }) => state.update(value => value + 10)',
      }),
      registry,
    );
    registry.executeOverride('increment', [], state);

    expect(installed).toMatchObject({ overrideActive: true });
    expect(state.get()).toBe(10);

    const restored = await handleFunctionRegistryRequest(
      request('restore-1', 'registry/restore', { key: 'increment' }),
      registry,
    );
    expect(restored).toMatchObject({ overrideActive: false });
  });

  it('routes direct primitive value mutations with kind validation', async () => {
    const registry = createFunctionRegistry();
    const resource = createResourceContext({ count: 0 });
    registry.registerResource('query', [], resource);

    await handleFunctionRegistryRequest(
      request('set-1', 'registry/resource/set', {
        key: 'query',
        kind: 'query',
        value: { count: 1 },
      }),
      registry,
    );
    await expect(
      handleFunctionRegistryRequest(
        request('update-1', 'registry/resource/update', {
          key: 'query',
          kind: 'query',
          source: '(current) => ({ count: current.count + 2 })',
        }),
        registry,
      ),
    ).resolves.toEqual({ count: 3 });

    await expect(
      handleFunctionRegistryRequest(
        request('get-1', 'registry/resource/get', {
          key: 'query',
          kind: 'query',
        }),
        registry,
      ),
    ).resolves.toEqual({ count: 3 });

    await expect(
      handleFunctionRegistryRequest(
        request('get-2', 'registry/resource/get', {
          key: 'query',
          kind: 'mutation',
        }),
        registry,
      ),
    ).rejects.toThrow('exposes query capabilities, not mutation');
  });

  it('fills a named control through the page method and returns controls', async () => {
    document.body.replaceChildren();
    const email = document.createElement('input');
    email.setAttribute('data-craft-name', 'email');
    email.setAttribute('aria-label', 'Email');
    email.type = 'email';
    document.body.append(email);

    const result = await handleFunctionRegistryRequest(
      request('page-1', 'page', {
        act: [{ id: 'email', fill: 'ada@example.com' }],
      }),
    );

    expect(email.value).toBe('ada@example.com');
    expect(result).toMatchObject({
      status: 'ready',
      controls: [
        expect.objectContaining({
          id: 'email',
          role: 'textbox',
          value: 'ada@example.com',
        }),
      ],
    });
  });

  it('navigates with goto then returns the destination url', async () => {
    let pageUrl = 'http://localhost/';
    const navigated: string[] = [];
    const result = await handleFunctionRegistryRequest(
      request('page-goto', 'page', { act: [{ goto: '/login-form' }] }),
      createFunctionRegistry(),
      () => document,
      () => ({ pageUrl }),
      async (url) => {
        navigated.push(url);
        pageUrl = `http://localhost${url}`;
      },
    );

    expect(navigated).toEqual(['/login-form']);
    expect(result).toMatchObject({
      status: 'ready',
      url: 'http://localhost/login-form',
    });
  });

  it('returns an error when goto has no navigator', async () => {
    const result = await handleFunctionRegistryRequest(
      request('page-goto', 'page', { act: [{ goto: '/login-form' }] }),
    );
    expect(result).toMatchObject({
      error: 'goto "/login-form" is not available',
    });
  });

  it('does not recreate the MCP page badge after stop', () => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    const socket = fakeRegistryBridgeSocket();
    const stop = runInInjectionContext(TestBed.inject(Injector), () =>
      startFunctionRegistryBridge({
        injector: TestBed.inject(Injector),
        url: 'ws://127.0.0.1:3333',
        clientId: 'client-aaaaaaaa',
        createSocket: () => socket,
        getPageInfo: () => ({
          pageUrl: 'http://localhost/',
          pageTitle: 'Demo',
        }),
        navigate: async () => undefined,
        getDocument: () => document,
      }),
    );

    stop();
    const onclose = socket.onclose;
    expect(onclose).toEqual(expect.any(Function));
    (onclose as (event: CloseEvent) => void)(new CloseEvent('close'));

    expect(document.getElementById('mcp-page-bridge-status')).toBeNull();
  });

  it('starts the bridge without a navigate callback', () => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    const socket = fakeRegistryBridgeSocket();
    const stop = runInInjectionContext(TestBed.inject(Injector), () =>
      startFunctionRegistryBridge({
        injector: TestBed.inject(Injector),
        url: 'ws://127.0.0.1:3333',
        clientId: 'client-aaaaaaaa',
        createSocket: () => socket,
        getPageInfo: () => ({
          pageUrl: 'http://localhost/',
          pageTitle: 'Demo',
        }),
        getDocument: () => document,
      }),
    );
    stop();
  });
});

function fakeRegistryBridgeSocket(): RegistryBridgeSocket {
  return {
    readyState: 1,
    send: () => undefined,
    close: () => undefined,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
}

function request(
  callId: string,
  method: RegistryBridgeRequest['method'],
  params?: Readonly<Record<string, unknown>>,
): RegistryBridgeRequest {
  return {
    type: 'request',
    callId,
    method,
    ...(params === undefined ? {} : { params }),
  };
}

function createStateContext(initialValue: unknown): StateMethodRuntimeContext {
  let value = initialValue;
  return {
    kind: 'state',
    get: () => value,
    set: (next) => (value = next),
    update: (updater) => (value = updater(value)),
    patch: (updater) => (value = { ...(value as object), ...updater(value) }),
    originalSource: '() => undefined',
  };
}

function createResourceContext(
  initialValue: unknown,
): PrimitiveResourceRuntimeContext<'query'> {
  let value = initialValue;
  return {
    kind: 'query',
    grouped: false,
    ids: () => [],
    get: () => value,
    set: (next) => (value = next),
    update: (updater) => (value = updater(value)),
    patch: (updater) => (value = { ...(value as object), ...updater(value) }),
  };
}
