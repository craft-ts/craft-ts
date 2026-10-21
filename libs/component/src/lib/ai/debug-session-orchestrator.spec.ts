import {
  createSendContextSession,
  DEBUG_SESSION_EXPORT_VERSION,
} from '@craft-ts/core';
import { describe, expect, it, vi } from 'vitest';
import {
  compileReplayPlan,
  connectReplaySnapshotCapture,
  createReplaySnapshot,
  executeReplayPlan,
  recordReplaySnapshot,
  validateReplaySnapshot,
  type ReplayCommand,
} from './debug-session-orchestrator';
import type { SendContextEvent, SendContextReplayExport } from '@craft-ts/core';

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

function session(events: readonly SendContextEvent[]): SendContextReplayExport {
  return {
    format: 'craft-debug-session',
    version: DEBUG_SESSION_EXPORT_VERSION,
    startUrl: 'http://localhost/',
    exportedAt: 100,
    truncated: false,
    events,
    clips: [],
  };
}

function recordedSession(): SendContextReplayExport {
  return session([
    event(1, {
      kind: 'dom',
      phase: 'emitted',
      correlationId: 'click-1',
      payload: { action: 'click', selector: '#save' },
    }),
    event(2, {
      kind: 'craft',
      phase: 'started',
      name: 'method:mutate',
      operationId: 'mutation-1',
      correlationId: 'click-1',
      payload: {
        host: 'Mutation',
        replayInvocation: {
          address: 'IssuePage#1 / method:mutate',
          args: [{ id: 'issue-1' }],
        },
      },
    }),
    event(3, {
      kind: 'http',
      phase: 'started',
      operationId: 'http-1',
      correlationId: 'click-1',
      payload: {
        source: 'craft-http-client',
        method: 'PATCH',
        url: '/api/issues/issue-1',
        params: {},
        payload: { status: 'closed' },
      },
    }),
    event(4, {
      kind: 'http',
      phase: 'succeeded',
      operationId: 'http-1',
      correlationId: 'click-1',
      response: { ok: true },
    }),
    event(5, {
      kind: 'craft',
      phase: 'succeeded',
      name: 'method:mutate',
      operationId: 'mutation-1',
      correlationId: 'click-1',
      payload: { host: 'Mutation' },
    }),
    event(6, {
      kind: 'dom',
      phase: 'emitted',
      correlationId: 'link-2',
      payload: { action: 'click', selector: '#next' },
    }),
    event(7, {
      kind: 'navigation',
      phase: 'started',
      operationId: 'navigation-2',
      correlationId: 'link-2',
      payload: { url: 'http://localhost/issues/issue-1' },
    }),
    event(8, {
      kind: 'navigation',
      phase: 'succeeded',
      operationId: 'navigation-2',
      correlationId: 'link-2',
    }),
  ]);
}

describe('debug session replay orchestrator', () => {
  it('compiles commands with causal ordering and operation observations', () => {
    const plan = compileReplayPlan(recordedSession());

    expect(plan.status).toBe('replayable');
    expect(plan.issues).toEqual([]);
    expect(plan.commands.map(({ kind }) => kind)).toEqual([
      'invoke',
      'navigate',
    ]);
    expect(plan.commands[1]?.dependsOn).toContain(plan.commands[0]?.id);
    expect(plan.commands[0]?.expected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'http', phase: 'succeeded' }),
        expect.objectContaining({ kind: 'craft', phase: 'succeeded' }),
      ]),
    );
  });

  it('preflights known targets and reports missing or ambiguous addresses', () => {
    const plan = compileReplayPlan(recordedSession(), (kind) =>
      kind === 'method' ? 'missing' : 'ambiguous',
    );

    expect(plan.status).toBe('partial');
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-target' }),
        expect.objectContaining({ code: 'ambiguous-target' }),
      ]),
    );
  });

  it('runs independent commands at the same timeline boundary concurrently', async () => {
    const started: string[] = [];
    const releases: (() => void)[] = [];
    const run = executeReplayPlan(
      {
        version: 1,
        status: 'replayable',
        observations: [],
        issues: [],
        commands: ['one', 'two'].map((id) => ({
          id,
          operationId: id,
          kind: 'invoke' as const,
          sequence: id === 'one' ? 1 : 2,
          atMs: 10,
          dependsOn: [],
          payload: {},
          expected: [],
        })),
      },
      {
        execute: (command) => {
          started.push(command.id);
          return new Promise<void>((resolve) => releases.push(resolve));
        },
        observations: () => [],
      },
    );

    await Promise.resolve();
    expect(started).toEqual(['one', 'two']);
    releases.forEach((release) => release());
    await expect(run).resolves.toMatchObject({ status: 'completed' });
  });

  it('captures and deduplicates snapshots after the application becomes quiescent', async () => {
    vi.useFakeTimers();
    try {
      const recording = createSendContextSession();
      recording.startRecord();
      let quiescent = false;
      let primitives: Readonly<Record<string, unknown>> = { count: 1 };
      let notify!: () => void;
      const disconnect = connectReplaySnapshotCapture({
        session: recording,
        appVersion: 'test-app',
        route: () => '/items',
        primitives: () => primitives,
        storage: async () => [],
        isQuiescent: () => quiescent,
        subscribe: (onChange) => {
          notify = onChange;
          return () => undefined;
        },
        debounceMs: 100,
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(
        recording.events.filter((item) => item.name === 'replay-checkpoint'),
      ).toHaveLength(0);
      quiescent = true;
      await vi.advanceTimersByTimeAsync(100);
      expect(
        recording.events.filter((item) => item.name === 'replay-checkpoint'),
      ).toHaveLength(1);

      notify();
      await vi.advanceTimersByTimeAsync(100);
      expect(
        recording.events.filter((item) => item.name === 'replay-checkpoint'),
      ).toHaveLength(1);
      primitives = { count: 2 };
      notify();
      await vi.advanceTimersByTimeAsync(100);
      expect(
        recording.events.filter((item) => item.name === 'replay-checkpoint'),
      ).toHaveLength(2);
      disconnect();
      recording.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports incomplete arguments and missing async results before execution', () => {
    const plan = compileReplayPlan(
      session([
        event(1, {
          kind: 'dom',
          phase: 'emitted',
          correlationId: 'click',
          payload: { action: 'click', selector: '#save' },
        }),
        event(2, {
          kind: 'craft',
          phase: 'started',
          operationId: 'mutation',
          correlationId: 'click',
          payload: {
            replayInvocation: {
              address: 'IssuePage / method:save',
              args: [undefined],
            },
          },
        }),
        event(3, {
          kind: 'http',
          phase: 'started',
          operationId: 'http',
          correlationId: 'click',
          payload: { method: 'POST', url: '/save' },
        }),
      ]),
    );

    expect(plan.status).toBe('partial');
    expect(plan.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['missing-arguments', 'missing-result']),
    );
  });

  it('runs commands through adapters and waits for recorded result barriers', async () => {
    const plan = compileReplayPlan(recordedSession());
    const actual: SendContextEvent[] = [];
    const execute = vi.fn(async (command: ReplayCommand) => {
      if (command.kind === 'invoke') {
        actual.push(
          event(10, {
            kind: 'http',
            phase: 'succeeded',
            operationId: 'actual-http',
            payload: {
              method: 'PATCH',
              url: '/api/issues/issue-1',
              params: {},
              payload: { status: 'closed' },
            },
            response: { ok: true },
          }),
          event(11, {
            kind: 'craft',
            phase: 'succeeded',
            name: 'method:mutate',
            operationId: 'actual-mutation',
            payload: { host: 'Mutation' },
          }),
        );
        return { operationId: 'actual-mutation' };
      }
      actual.push(
        event(12, {
          kind: 'navigation',
          phase: 'succeeded',
          operationId: 'actual-navigation',
          payload: { url: 'http://localhost/issues/issue-1' },
        }),
      );
      return { operationId: 'actual-navigation' };
    });

    const result = await executeReplayPlan(plan, {
      execute,
      observations: () => actual,
      timeoutMs: 100,
    });

    expect(result).toMatchObject({ status: 'completed' });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[0].dependsOn).toContain(
      execute.mock.calls[0]?.[0].id,
    );
  });

  it('only accepts complete, unredacted versioned snapshots', () => {
    const snapshot = createReplaySnapshot({
      appVersion: '1.2.3',
      routeUrl: '/issues/issue-1',
      primitives: { issue: { id: 'issue-1', status: 'open' } },
      storage: [
        {
          backend: 'local',
          storeName: 'issues',
          key: 'issue-1',
          kind: 'queryById',
          value: { id: 'issue-1', status: 'open' },
        },
      ],
      inFlightOperations: 0,
      capturedAt: 42,
    });

    expect(validateReplaySnapshot(snapshot)).toMatchObject({ ok: true });
    expect(() =>
      createReplaySnapshot({
        appVersion: '1.2.3',
        routeUrl: '/issues/issue-1',
        primitives: {},
        storage: [],
        inFlightOperations: 1,
      }),
    ).toThrow(/zero in-flight operations/);
    expect(
      validateReplaySnapshot({
        ...snapshot,
        primitives: { secret: '[REDACTED]' },
      }),
    ).toMatchObject({ ok: false });
  });

  it('exports recorded snapshots as part of the v6 archive', () => {
    const recording = createSendContextSession();
    const snapshot = recordReplaySnapshot(recording, {
      appVersion: '1.2.3',
      routeUrl: '/issues',
      primitives: { issues: [] },
      storage: [],
      inFlightOperations: 0,
      capturedAt: 42,
    });

    expect(JSON.parse(recording.exportSessionJson())).toMatchObject({
      version: DEBUG_SESSION_EXPORT_VERSION,
      snapshots: [snapshot],
    });
    recording.destroy();
  });
});
