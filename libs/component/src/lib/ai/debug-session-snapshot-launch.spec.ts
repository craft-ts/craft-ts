import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDebugSnapshotLaunch } from './debug-session-snapshot-launch';
import {
  CRAFT_DEBUG_REPLAY_CHANNEL,
  CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
} from './debug-session-replay-signals';
import type { DebugAppSnapshot } from './debug-session-app-snapshot';
import { createResumeFidelityReport } from './debug-session-resume-executor';

const ORIGIN = location.origin;

function snapshot(): DebugAppSnapshot {
  return {
    format: 'craft-debug-app-snapshot',
    version: 1,
    route: '/cart',
    primitives: { 'Cart#1 / state:count': 4 },
    storage: [],
    warnings: ['note'],
  };
}

function setup(
  resume?: Parameters<typeof startDebugSnapshotLaunch>[0]['resume'],
) {
  const posted: unknown[] = [];
  const opener = {
    postMessage: vi.fn((message: unknown) => posted.push(message)),
  };
  Object.defineProperty(window, 'opener', {
    value: opener,
    configurable: true,
  });
  history.replaceState(
    null,
    '',
    `/cart?${CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM}=run-1&a=1`,
  );
  const reload = vi.fn(() => true);
  const registry = {
    restore: vi.fn(),
    clearReplaySnapshots: vi.fn(),
    list: () => [{ address: 'List#3 / query:people', reload }],
  };
  const methods = {
    addresses: () => ['Form#2 / method:save'],
    invoke: vi.fn(() => Promise.resolve()),
  };
  const storageRegistry = { restore: vi.fn(async () => undefined) };
  const promise = startDebugSnapshotLaunch({
    allowedOrigins: new Set([ORIGIN]),
    registry: registry as never,
    storageRegistry: storageRegistry as never,
    methods: methods as never,
    reviveArgument: (value) => value,
    ...(resume ? { resume } : {}),
  });
  const deliver = (data: unknown, source: unknown = opener) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: ORIGIN,
        source: source as MessageEventSource,
      }),
    );
  return {
    posted,
    opener,
    registry,
    storageRegistry,
    methods,
    reload,
    promise,
    deliver,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'opener', { value: null, configurable: true });
  history.replaceState(null, '', '/');
});

describe('startDebugSnapshotLaunch', () => {
  it('does nothing outside a launch from the dashboard', () => {
    history.replaceState(null, '', '/cart');
    expect(
      startDebugSnapshotLaunch({
        allowedOrigins: new Set([ORIGIN]),
        registry: {} as never,
        storageRegistry: {} as never,
        methods: {} as never,
        reviveArgument: (value) => value,
      }),
    ).toBeUndefined();
  });

  it('asks its opener, restores what it is sent, then releases the bootstrap', async () => {
    const { posted, registry, storageRegistry, promise, deliver } = setup();
    expect(posted).toEqual([
      {
        channel: CRAFT_DEBUG_REPLAY_CHANNEL,
        type: 'snapshot-request',
        launchId: 'run-1',
      },
    ]);
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
    });
    await promise;
    expect(storageRegistry.restore).toHaveBeenCalledWith([]);
    expect(registry.restore).toHaveBeenCalledWith({
      'Cart#1 / state:count': 4,
    });
    expect(posted.at(-1)).toMatchObject({
      type: 'snapshot-restored',
      warnings: ['note'],
    });
    // The launch id must not leak into the router's URL; the rest stays.
    expect(location.search).toBe('?a=1');
  });

  it('receives shared resources and publishes newly acquired values live', async () => {
    vi.stubGlobal('WebSocket', class WebSocketStub {});
    vi.stubGlobal('Worker', class WorkerStub {});
    vi.stubGlobal('SharedWorker', class SharedWorkerStub {});
    // Stubbed so that the observing wrapper does not outlive this test.
    vi.stubGlobal('fetch', window.fetch);
    const nativeFetch = window.fetch;
    const nativeOpen = XMLHttpRequest.prototype.open;
    let releaseRoute!: () => void;
    let executedResources: Map<string, unknown> | undefined;
    const { posted, promise, deliver } = setup({
      waitForRoute: () =>
        new Promise<void>((resolve) => (releaseRoute = resolve)),
      execute: async (
        _plan,
        _manifest,
        _snapshot,
        _setAllowedCalls,
        _onStep,
        _taskWasScheduled,
        sharedResources,
        onResourceAcquired,
      ) => {
        executedResources = sharedResources;
        onResourceAcquired('cart', { id: 'new-server-cart' });
        return createResumeFidelityReport([]);
      },
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
      resumePlan: {
        format: 'craft-debug-session-resume-plan',
        version: 1,
        targetElapsedMs: 0,
        status: 'ready',
        steps: [],
        problems: [],
        expectedCalls: [],
        substitutions: [],
      },
      resumeManifest: {
        format: 'craft-debug-session-resume-manifest',
        version: 1,
        entries: [],
        checklistMarkdown: '',
      },
      deferResume: true,
      resumeResources: { auth: { token: 'ephemeral-token' } },
    });
    await promise;
    expect(posted).not.toContainEqual(
      expect.objectContaining({ type: 'resume-started' }),
    );
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'snapshot-restored' }),
      ),
    );
    window.dispatchEvent(new Event('pointerdown'));
    expect(window.fetch).not.toBe(nativeFetch);
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'resume-resource',
      launchId: 'run-1',
      resource: 'cart',
      value: { id: 'shared-server-cart' },
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'resume-start',
      launchId: 'run-1',
    });
    releaseRoute();
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-started' }),
      ),
    );
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-completed' }),
      ),
    );
    // Taking over lifts the holds; fetch stays observed for declared outcomes.
    expect(XMLHttpRequest.prototype.open).toBe(nativeOpen);
    expect(window.fetch).not.toBe(nativeFetch);
    expect(executedResources?.get('auth')).toEqual({
      token: 'ephemeral-token',
    });
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'resume-resource',
        resource: 'cart',
        value: { id: 'new-server-cart' },
      }),
    );
    window.dispatchEvent(new Event('pointerdown'));
  });

  it('serves an in-flight held fetch from a human-approved override', async () => {
    vi.stubGlobal('WebSocket', class WebSocketStub {});
    vi.stubGlobal('Worker', class WorkerStub {});
    vi.stubGlobal('SharedWorker', class SharedWorkerStub {});
    const nativeFetch = vi.fn(async () => {
      throw new Error('The held request must not reach the network.');
    });
    vi.stubGlobal('fetch', nativeFetch);
    let responseStatus = 0;
    let responseBody: unknown;
    const { posted, promise, deliver } = setup({
      waitForRoute: async () => undefined,
      isReadOnlyRequest: () => false,
      execute: async (_plan, _manifest, _snapshot, setAllowedCalls) => {
        setAllowedCalls([]);
        const response = await fetch(new URL('/admin/products/p-1', location.href), {
          method: 'PATCH',
          body: JSON.stringify({ price: 12 }),
        });
        responseStatus = response.status;
        responseBody = await response.json();
        return createResumeFidelityReport([]);
      },
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
      resumePlan: {
        format: 'craft-debug-session-resume-plan',
        version: 1,
        targetElapsedMs: 0,
        status: 'ready',
        steps: [],
        problems: [],
        expectedCalls: [],
        substitutions: [],
      },
      resumeManifest: {
        format: 'craft-debug-session-resume-manifest',
        version: 1,
        entries: [],
        checklistMarkdown: '',
      },
      resumeOverrides: [],
    });
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-hold' }),
      ),
    );
    const hold = posted.find(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        item.type === 'resume-hold',
    ) as { holdId: string };
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'resume-hold-decision',
      launchId: 'run-1',
      holdId: hold.holdId,
      decision: 'override',
      override: {
        call: 'PATCH /admin/products/p-1',
        response: { error: 'Forbidden' },
        status: 403,
        frozen: true,
        assistedBy: 'ai',
      },
    });
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-completed' }),
      ),
    );
    await promise;
    expect(responseStatus).toBe(403);
    expect(responseBody).toEqual({ error: 'Forbidden' });
    expect(nativeFetch).not.toHaveBeenCalled();
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'resume-completed',
        classification: 'assisted',
        overrides: [expect.objectContaining({ assistedBy: 'ai' })],
      }),
    );
  });

  it('ignores a snapshot from another window or for another launch', async () => {
    const { registry, promise, deliver } = setup();
    deliver(
      {
        channel: CRAFT_DEBUG_REPLAY_CHANNEL,
        type: 'restore-app-snapshot',
        launchId: 'run-1',
        snapshot: snapshot(),
      },
      {},
    );
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'other',
      snapshot: snapshot(),
    });
    expect(registry.restore).not.toHaveBeenCalled();
    // Let the launch end: an invalid snapshot is reported and the app starts.
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: { nope: true },
    });
    await promise;
    expect(registry.restore).not.toHaveBeenCalled();
  });

  it('relaunches what was in flight once the app has created it', async () => {
    const { posted, methods, reload, promise, deliver } = setup();
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: {
        ...snapshot(),
        inFlight: {
          invocations: [
            { sequence: 1, address: 'Form#1 / method:save', args: [{ id: 7 }] },
          ],
          reloads: ['List#1 / query:people', 'Gone#1 / query:none'],
        },
      },
    });
    await promise;
    await vi.waitFor(
      () => expect(posted.at(-1)).toMatchObject({ type: 'snapshot-inflight' }),
      { timeout: 15_000 },
    );
    // Instance ordinals differ between the recording and this run.
    expect(methods.invoke).toHaveBeenCalledWith(
      'Form#1 / method:save',
      undefined,
      [{ id: 7 }],
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(posted.at(-1)).toMatchObject({
      relaunched: ['Form#1 / method:save', 'List#1 / query:people'],
      failed: ['Gone#1 / query:none'],
    });
  }, 20_000);
});

function resumePlan(
  overrides: Partial<import('./debug-session-resume-plan').DebugSessionResumePlan> = {},
) {
  return {
    format: 'craft-debug-session-resume-plan' as const,
    version: 1 as const,
    targetElapsedMs: 0,
    status: 'ready' as const,
    steps: [],
    problems: [],
    expectedCalls: [],
    substitutions: [],
    ...overrides,
  };
}

const manifest = {
  format: 'craft-debug-session-resume-manifest',
  version: 1,
  entries: [],
  checklistMarkdown: '',
};

function stubTransports() {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
  vi.stubGlobal('Worker', class WorkerStub {});
  vi.stubGlobal('SharedWorker', class SharedWorkerStub {});
}

const callFunction = (id: string, input: unknown) =>
  fetch(new URL('/__server-functions', location.href), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, input }),
  });

describe('resume barrier', () => {
  const sessionSubstitution = {
    resource: 'session',
    fingerprint: 'aabbccddeeff0011',
    placeholder: 'craft-ref:aabbccddeeff0011',
    path: 'storage.localStorage[0][1].queryValue.token',
    valuePath: '$.token',
  };
  const acquireSession = {
    id: 'acquire:session',
    kind: 'acquire' as const,
    resource: 'session',
    allowedCalls: ['ecommerce.auth.login', 'ecommerce.auth.me'],
    blocking: true,
  };

  it('holds a request carrying a placeholder until its resource is reacquired, then rewrites it', async () => {
    stubTransports();
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        sent.push(await request.text());
        return new Response('"ok"', { status: 200 });
      }),
    );
    let status = 0;
    const { posted, deliver } = setup({
      waitForRoute: async () => undefined,
      execute: async (_plan, _manifest, _snapshot, _allowed, _onStep, _tasks, _shared, onResourceAcquired) => {
        const pending = callFunction('ecommerce.auth.me', {
          token: 'craft-ref:aabbccddeeff0011',
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(sent).toEqual([]);
        onResourceAcquired('session', { token: 'fresh-token' });
        status = (await pending).status;
        return createResumeFidelityReport([]);
      },
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
      resumePlan: resumePlan({
        steps: [acquireSession],
        substitutions: [sessionSubstitution],
      }),
      resumeManifest: manifest,
    });
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-completed', classification: 'real' }),
      ),
    );
    expect(status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('fresh-token');
    expect(sent[0]).not.toContain('craft-ref:');
  });

  it('refuses a request whose placeholder has no recorded counterpart', async () => {
    stubTransports();
    const nativeFetch = vi.fn(async () => new Response('"ok"'));
    vi.stubGlobal('fetch', nativeFetch);
    let refusal: unknown;
    const { posted, deliver } = setup({
      waitForRoute: async () => undefined,
      execute: async () => {
        refusal = await callFunction('ecommerce.cart.get', {
          cartId: 'craft-ref:ffffffffffffffff',
        }).catch((error: unknown) => error);
        return createResumeFidelityReport([]);
      },
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
      resumePlan: resumePlan({ substitutions: [sessionSubstitution] }),
      resumeManifest: manifest,
    });
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-completed' }),
      ),
    );
    expect(refusal).toBeInstanceOf(Error);
    expect(nativeFetch).not.toHaveBeenCalled();
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'resume-completed',
        classification: 'refused',
        steps: expect.arrayContaining([
          expect.objectContaining({ code: 'placeholder-unresolved' }),
        ]),
      }),
    );
  });

  it('compares a declared outcome that happens after the user took over', async () => {
    stubTransports();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"code":"FORBIDDEN"}', { status: 403 })),
    );
    const { posted, deliver } = setup({
      waitForRoute: async () => undefined,
      execute: async () => createResumeFidelityReport([]),
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
      resumePlan: resumePlan({
        expectedOutcomes: [
          { call: 'ecommerce.product.save', outcome: 'recorded', status: 403 },
        ],
      }),
      resumeManifest: manifest,
    });
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'resume-completed' }),
      ),
    );
    window.dispatchEvent(new Event('pointerdown'));
    const response = await callFunction('ecommerce.product.save', {});
    expect(response.status).toBe(403);
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({
          type: 'resume-outcome',
          id: 'outcome:ecommerce.product.save',
          status: 'conformant',
          detail: '403 attendu, 403 obtenu',
        }),
      ),
    );
  });

  it('serves the recorded answer while the barrier holds, under the recorded policy', async () => {
    stubTransports();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('"saved"', { status: 200 })),
    );
    let served: { status: number; body: string } | undefined;
    const { posted, deliver } = setup({
      waitForRoute: async () => undefined,
      execute: async (_plan, _manifest, _snapshot, setAllowedCalls) => {
        setAllowedCalls(new Set(['ecommerce.product.save']));
        const response = await callFunction('ecommerce.product.save', {});
        served = { status: response.status, body: await response.text() };
        return createResumeFidelityReport([]);
      },
    });
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
      resumePlan: resumePlan({
        expectedOutcomes: [
          {
            call: 'ecommerce.product.save',
            outcome: 'recorded',
            status: 403,
            onMismatch: 'recorded',
            recordedBody: '{"code":"FORBIDDEN"}',
          },
        ],
      }),
      resumeManifest: manifest,
    });
    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({
          type: 'resume-completed',
          classification: 'partially-simulated',
        }),
      ),
    );
    expect(served).toEqual({ status: 403, body: '{"code":"FORBIDDEN"}' });
  });
});
