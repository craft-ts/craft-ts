import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDebugSnapshotLaunch } from './debug-session-snapshot-launch';
import {
  CRAFT_DEBUG_REPLAY_CHANNEL,
  CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
} from './debug-session-replay-signals';
import type { DebugAppSnapshot } from './debug-session-app-snapshot';

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

function setup() {
  const posted: unknown[] = [];
  const opener = { postMessage: vi.fn((message: unknown) => posted.push(message)) };
  Object.defineProperty(window, 'opener', { value: opener, configurable: true });
  history.replaceState(null, '', `/cart?${CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM}=run-1&a=1`);
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
  });
  const deliver = (data: unknown, source: unknown = opener) =>
    window.dispatchEvent(
      new MessageEvent('message', { data, origin: ORIGIN, source: source as MessageEventSource }),
    );
  return { posted, opener, registry, storageRegistry, methods, reload, promise, deliver };
}

afterEach(() => {
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
      { channel: CRAFT_DEBUG_REPLAY_CHANNEL, type: 'snapshot-request', launchId: 'run-1' },
    ]);
    deliver({
      channel: CRAFT_DEBUG_REPLAY_CHANNEL,
      type: 'restore-app-snapshot',
      launchId: 'run-1',
      snapshot: snapshot(),
    });
    await promise;
    expect(storageRegistry.restore).toHaveBeenCalledWith([]);
    expect(registry.restore).toHaveBeenCalledWith({ 'Cart#1 / state:count': 4 });
    expect(posted.at(-1)).toMatchObject({
      type: 'snapshot-restored',
      warnings: ['note'],
    });
    // The launch id must not leak into the router's URL; the rest stays.
    expect(location.search).toBe('?a=1');
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
    expect(methods.invoke).toHaveBeenCalledWith('Form#1 / method:save', undefined, [
      { id: 7 },
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(posted.at(-1)).toMatchObject({
      relaunched: ['Form#1 / method:save', 'List#1 / query:people'],
      failed: ['Gone#1 / query:none'],
    });
  }, 20_000);
});
