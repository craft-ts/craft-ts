import { DEBUG_SESSION_EXPORT_VERSION } from '@craft-ts/core';
import type { SendContextEvent, SendContextReplayExport } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import {
  buildDebugAppSnapshot,
  DEBUG_APP_SNAPSHOT_FORMAT,
  isDebugAppSnapshot,
} from './debug-session-app-snapshot';

function event(
  sequence: number,
  values: Partial<SendContextEvent> & Pick<SendContextEvent, 'kind' | 'phase'>,
): SendContextEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    timestamp: sequence * 10,
    elapsedMs: sequence * 10,
    ...values,
  };
}

const change = (sequence: number, state: Record<string, unknown>) =>
  event(sequence, {
    kind: 'primitive',
    phase: 'emitted',
    name: 'primitive-change',
    state,
  });

const navigation = (sequence: number, url: string) =>
  event(sequence, {
    kind: 'navigation',
    phase: 'started',
    name: 'NavigationStart',
    payload: { url },
  });

function checkpoint(sequence: number, route: string, count: number) {
  return event(sequence, {
    kind: 'snapshot',
    phase: 'emitted',
    name: 'replay-checkpoint',
    payload: {
      format: 'craft-debug-replay-snapshot',
      version: 1,
      appVersion: 'test',
      capturedAt: sequence,
      route: { url: route },
      primitives: { 'Cart#1 / state:count': count, 'Cart#1 / state:name': 'a' },
      storage: [],
      capabilities: { primitives: true, storage: true, inFlightOperations: false },
    },
  });
}

function session(
  events: readonly SendContextEvent[],
  extra: Partial<SendContextReplayExport> = {},
): SendContextReplayExport {
  return {
    format: 'craft-debug-session',
    version: DEBUG_SESSION_EXPORT_VERSION,
    startUrl: 'http://localhost:4200/home',
    exportedAt: 100,
    truncated: false,
    events,
    clips: [],
    ...extra,
  };
}

describe('buildDebugAppSnapshot', () => {
  it('starts from the last checkpoint before the event and replays later changes', () => {
    const snapshot = buildDebugAppSnapshot(
      session([
        checkpoint(1, 'http://localhost:4200/cart', 1),
        change(2, { 'Cart#1 / state:count': 2 }),
        checkpoint(3, 'http://localhost:4200/cart', 3),
        change(4, { 'Cart#1 / state:count': 4 }),
        change(6, { 'Cart#1 / state:count': 99 }),
      ]),
      6,
    );
    expect(snapshot.primitives).toEqual({
      'Cart#1 / state:count': 4,
      'Cart#1 / state:name': 'a',
    });
    expect(snapshot.route).toBe('/cart');
    expect(snapshot.warnings).toEqual([]);
    expect(isDebugAppSnapshot(snapshot)).toBe(true);
    expect(snapshot.format).toBe(DEBUG_APP_SNAPSHOT_FORMAT);
  });

  it('carries pending temporal tasks and the runtime clock from the chosen checkpoint', () => {
    const snapshot = buildDebugAppSnapshot(session([event(1, {
      kind: 'snapshot',
      phase: 'emitted',
      name: 'replay-checkpoint',
      payload: {
        format: 'craft-debug-replay-snapshot',
        version: 1,
        appVersion: 'test',
        capturedAt: 10,
        route: { url: 'http://localhost:4200/search' },
        primitives: {},
        storage: [],
        temporalNow: 75,
        pendingTasks: [{ kind: 'debounce', owner: 'search', dueAt: 250 }],
        capabilities: { primitives: true, storage: true, inFlightOperations: false },
      },
    })]));

    expect(snapshot).toMatchObject({
      temporalNow: 75,
      pendingTasks: [{ kind: 'debounce', owner: 'search', dueAt: 250 }],
    });
  });

  it('rejects malformed temporal state in a launch snapshot', () => {
    const valid = buildDebugAppSnapshot(session([]));
    expect(isDebugAppSnapshot({ ...valid, temporalNow: Number.NaN })).toBe(false);
    expect(isDebugAppSnapshot({
      ...valid,
      pendingTasks: [{ kind: 'timeout', dueAt: Number.POSITIVE_INFINITY }],
    })).toBe(false);
  });

  it('falls back to the initial snapshot and says so', () => {
    const snapshot = buildDebugAppSnapshot(
      session(
        [change(1, { 'Cart#1 / state:count': 1 }), navigation(2, '/cart?x=1')],
        { initialSnapshot: { 'Cart#1 / state:count': 0, 'Cart#1 / state:name': 'z' } },
      ),
    );
    expect(snapshot.primitives).toEqual({
      'Cart#1 / state:count': 1,
      'Cart#1 / state:name': 'z',
    });
    expect(snapshot.route).toBe('/cart?x=1');
    expect(snapshot.warnings[0]).toMatch(/Aucun checkpoint/);
    expect(snapshot.beforeSequence).toBeUndefined();
  });

  it('takes the route of the last navigation before the event, not after', () => {
    const events = [
      navigation(1, 'http://localhost:4200/a'),
      navigation(3, 'http://localhost:4200/b'),
    ];
    expect(buildDebugAppSnapshot(session(events), 3).route).toBe('/a');
    expect(buildDebugAppSnapshot(session(events), 4).route).toBe('/b');
    expect(buildDebugAppSnapshot(session([]), 4).route).toBe('/home');
  });

  it('opens a route carrying a masked secret without its query', () => {
    const snapshot = buildDebugAppSnapshot(
      session([navigation(1, '/reset?token=%5BREDACTED%5D#top')]),
    );
    expect(snapshot.route).toBe('/reset');
    expect(snapshot.warnings.join(' ')).toMatch(/secret masqué/);
  });

  it('warns that browser storage is the initial one', () => {
    const snapshotJson = JSON.stringify({
      version: 1,
      localStorage: [['k', 'v']],
      sessionStorage: [],
      cookies: [],
      cookieStoreSupported: true,
      indexedDbSupported: true,
      indexedDb: [],
      warnings: [],
    });
    const snapshot = buildDebugAppSnapshot(
      session([
        event(1, {
          kind: 'storage',
          phase: 'emitted',
          name: 'browser-storage-initial',
          payload: { snapshotJson },
        }),
      ]),
    );
    expect(snapshot.browserStorage?.localStorage).toEqual([['k', 'v']]);
    expect(snapshot.warnings.join(' ')).toMatch(/début de l’enregistrement/);
  });

  it('restores the browser storage recaptured before the chosen moment', () => {
    const storage = (value: string) => ({
      version: 1,
      localStorage: [['k', value]],
      sessionStorage: [],
      cookies: [],
      cookieStoreSupported: true,
      indexedDbSupported: true,
      indexedDb: [],
      warnings: [],
    });
    const recorded = (sequence: number, name: string, value: string) =>
      event(sequence, {
        kind: 'storage',
        phase: 'emitted',
        name,
        payload: { snapshotJson: JSON.stringify(storage(value)) },
      });
    const events = [
      recorded(1, 'browser-storage-initial', 'start'),
      recorded(3, 'browser-storage-checkpoint', 'middle'),
      recorded(6, 'browser-storage-checkpoint', 'late'),
    ];
    const middle = buildDebugAppSnapshot(session(events), 6);
    expect(middle.browserStorage?.localStorage).toEqual([['k', 'middle']]);
    expect(middle.warnings.join(' ')).not.toMatch(/stockage/);
    expect(
      buildDebugAppSnapshot(session(events)).browserStorage?.localStorage,
    ).toEqual([['k', 'late']]);
    const early = buildDebugAppSnapshot(session(events), 2);
    expect(early.browserStorage?.localStorage).toEqual([['k', 'start']]);
    expect(early.warnings.join(' ')).toMatch(/aucune recapture/);
  });

  describe('operations in flight', () => {
    const invocation = (
      sequence: number,
      correlationId: string,
      extra: Partial<SendContextEvent> = {},
    ) =>
      event(sequence, {
        kind: 'craft',
        phase: 'started',
        name: 'method:save',
        operationId: `craft-call-${sequence}`,
        correlationId,
        payload: {
          replayInvocation: {
            address: 'Form#1 / method:save',
            args: [{ id: 7 }],
          },
        },
        ...extra,
      });
    const http = (
      sequence: number,
      phase: 'started' | 'succeeded' | 'failed',
      operationId: string,
      correlationId?: string,
    ) =>
      event(sequence, {
        kind: 'http',
        phase,
        operationId,
        ...(correlationId ? { correlationId } : {}),
      });

    it('relaunches the method whose request had no answer yet', () => {
      const events = [
        invocation(1, 'c1'),
        http(2, 'started', 'h1', 'c1'),
        http(4, 'succeeded', 'h1', 'c1'),
      ];
      expect(buildDebugAppSnapshot(session(events), 3).inFlight).toEqual({
        invocations: [
          { sequence: 1, address: 'Form#1 / method:save', args: [{ id: 7 }] },
        ],
        reloads: [],
      });
      expect(buildDebugAppSnapshot(session(events), 5).inFlight).toBeUndefined();
    });

    it('only relaunches the call right before the request, not earlier ones of the interaction', () => {
      const events = [
        invocation(1, 'c1', {
          payload: {
            replayInvocation: { address: 'Nav#1 / method:close', args: [] },
          },
        }),
        invocation(2, 'c1'),
        http(3, 'started', 'h1', 'c1'),
      ];
      expect(
        buildDebugAppSnapshot(session(events)).inFlight?.invocations.map(
          (call) => call.address,
        ),
      ).toEqual(['Form#1 / method:save']);
    });

    it('reloads the primitives that were loading and warns about unexplained requests', () => {
      const loading = (sequence: number, status: string) =>
        event(sequence, {
          kind: 'primitive',
          phase: 'emitted',
          name: 'primitive-change',
          payload: { address: 'List#1 / query:people', status },
          state: {},
        });
      const events = [
        loading(1, 'loading'),
        loading(3, 'resolved'),
        loading(5, 'loading'),
        http(6, 'started', 'h9'),
      ];
      expect(buildDebugAppSnapshot(session(events), 4).inFlight).toBeUndefined();
      expect(buildDebugAppSnapshot(session(events), 7).inFlight?.reloads).toEqual([
        'List#1 / query:people',
      ]);
      const warned = buildDebugAppSnapshot(
        session([http(1, 'started', 'h9')]),
      );
      expect(warned.inFlight).toBeUndefined();
      expect(warned.warnings.join(' ')).toMatch(/1 requête\(s\) en cours/);
    });
  });
});
