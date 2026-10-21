import { describe, expect, it, vi } from 'vitest';
import {
  createSendContextSession,
  type SendContextEvent,
  type SendContextReplayExport,
  ɵcaptureCraftReplayTarget,
  ɵregisterCraftReplayTarget,
} from '@craft-ts/core';
import {
  validateReplayExport,
  validateDebugSessionExport,
  createRecordedResponseResolver,
  createReplayController,
  getReplaySteps,
  installReplayNetworkGuard,
  runReplayTest,
  runReplayTestOrThrow,
} from './debug-session-replay';

describe('debug session replay format', () => {
  it('returns a structured test verdict and records applied tolerances', async () => {
    document.body.innerHTML = '<button id="automated-replay">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'automated-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#automated-replay', action: 'click' },
        },
        {
          id: 'automated-checkpoint',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 2 },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'automated-list',
      scenarioVersion: 1,
      reason: 'Count is the business contract.',
      checkpoints: [
        {
          id: 'list-loaded',
          path: '/result',
          expected: { count: 2, requestId: '[REDACTED]' },
        },
      ],
      eventAssertions: [],
      visualAssertions: [],
      tolerances: [
        { assertionId: 'list-loaded', path: '/requestId', kind: 'redacted' },
      ],
    };

    const result = await runReplayTest(session, JSON.stringify(scenario), {
      readState: () => ({
        result: { count: 2, requestId: 'generated-at-runtime' },
      }),
    });
    expect(result).toMatchObject({
      status: 'passed',
      scenarioId: 'automated-list',
      scenarioVersion: 1,
      comparedAssertions: ['list-loaded'],
      appliedTolerances: [
        {
          assertionId: 'list-loaded',
          rule: { kind: 'redacted', path: '/requestId' },
        },
      ],
    });
  });

  it('throws a CI-friendly error for non-passing verdicts', async () => {
    await expect(
      runReplayTestOrThrow(
        {
          format: 'craft-debug-session',
          version: 5,
          startUrl: 'http://localhost/',
          exportedAt: 1,
          truncated: true,
          clips: [],
          events: [],
        },
        '{',
        {},
      ),
    ).rejects.toMatchObject({
      name: 'ReplayScenarioTestError',
      result: { status: 'not-replayable' },
    });
  });

  it('fails automation on a business checkpoint mismatch and rejects truncated sessions', async () => {
    document.body.innerHTML = '<button id="automated-failure">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'failure-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#automated-failure', action: 'click' },
        },
        {
          id: 'failure-checkpoint',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 2 },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'failure',
      scenarioVersion: 1,
      reason: 'Count remains strict.',
      checkpoints: [{ id: 'count', path: '/count', expected: 2 }],
      eventAssertions: [],
      visualAssertions: [],
      tolerances: [],
    };
    expect(
      await runReplayTest(session, JSON.stringify(scenario), {
        readState: () => ({ count: 3 }),
      }),
    ).toMatchObject({
      status: 'failed',
      firstDifference: {
        eventId: 'scenario:count',
        expected: 2,
        actual: 3,
      },
    });
    expect(
      await runReplayTest(
        { ...session, truncated: true },
        JSON.stringify(scenario),
        { readState: () => ({ count: 2 }) },
      ),
    ).toMatchObject({
      status: 'not-replayable',
    });
  });

  it('keeps unlisted state checkpoints strict in test mode', async () => {
    document.body.innerHTML = '<button id="strict-checkpoint">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'strict-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#strict-checkpoint', action: 'click' },
        },
        {
          id: 'strict-state',
          sequence: 2,
          timestamp: 11,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 2 },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'strict-default',
      scenarioVersion: 1,
      reason: 'Unlisted business state uses strict equality.',
      checkpoints: [{ id: 'state-count', path: '/count', expected: 2 }],
      eventAssertions: [],
      visualAssertions: [],
      tolerances: [],
    };

    expect(
      await runReplayTest(session, JSON.stringify(scenario), {
        readState: () => ({}),
      }),
    ).toMatchObject({
      status: 'failed',
      firstDifference: {
        eventId: 'scenario:state-count',
        expected: 2,
        actual: null,
      },
    });
  });

  it('checks a declared invocation address and arguments in test mode', async () => {
    document.body.innerHTML = '<button id="invocation-contract">Run</button>';
    const observed: SendContextReplayExport['events'][number][] = [];
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'invocation-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#invocation-contract', action: 'click' },
        },
        {
          id: 'invocation-start',
          sequence: 2,
          timestamp: 11,
          kind: 'craft',
          phase: 'started',
          name: 'loadUsers',
          operationId: 'recorded-op',
          payload: {
            host: 'method:loadUsers',
            replayInvocation: {
              address: 'component:Users#1 / method:loadUsers',
              args: [{ page: 1 }],
            },
          },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'users-load',
      scenarioVersion: 1,
      reason: 'The requested page is part of the API contract.',
      checkpoints: [],
      eventAssertions: [
        {
          id: 'load-page-one',
          kind: 'invocation',
          expected: {
            address: 'component:Users#1 / method:loadUsers',
            args: [{ page: 1 }],
          },
        },
      ],
      visualAssertions: [],
      tolerances: [],
    };
    const result = await runReplayTest(session, JSON.stringify(scenario), {
      observedEvents: () => observed,
      invokeRecordedMethod: (event) => {
        observed.push({
          ...event,
          id: 'actual-invocation',
          payload: {
            host: 'method:loadUsers',
            replayInvocation: {
              address: 'component:Users#1 / method:loadUsers',
              args: [{ page: 2 }],
            },
          },
        });
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      firstDifference: { eventId: 'scenario:load-page-one' },
    });
  });

  it('checks declared outgoing transport messages in test mode', async () => {
    document.body.innerHTML = '<button id="transport-contract">Run</button>';
    const observed: SendContextReplayExport['events'][number][] = [];
    const transportEvent = {
      id: 'recorded-transport',
      sequence: 2,
      timestamp: 11,
      elapsedMs: 1,
      kind: 'transport',
      phase: 'emitted',
      payload: {
        transportId: 'live-updates',
        transport: 'websocket',
        instanceId: 'socket-1',
        direction: 'outgoing',
        messageType: 'text',
        sequence: 1,
        elapsedMs: 1,
        replayable: true,
        data: { codec: 'text', value: 'subscribe' },
      },
    } as const;
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'transport-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#transport-contract', action: 'click' },
        },
        transportEvent,
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'subscribe-flow',
      scenarioVersion: 1,
      reason: 'The client must subscribe to the live feed.',
      checkpoints: [],
      eventAssertions: [
        {
          id: 'subscribe-message',
          kind: 'transport',
          expected: {
            transportId: 'live-updates',
            direction: 'outgoing',
            data: { codec: 'text', value: 'subscribe' },
          },
        },
      ],
      visualAssertions: [],
      tolerances: [],
    };
    const result = await runReplayTest(session, JSON.stringify(scenario), {
      observedEvents: () => observed,
      onTimelineAdvance: () => {
        observed.push({
          ...transportEvent,
          id: 'actual-transport',
          payload: {
            ...transportEvent.payload,
            data: { codec: 'text', value: 'unsubscribe' },
          },
        });
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      firstDifference: { eventId: 'scenario:subscribe-message' },
    });
  });

  it('checks declared HTTP request payloads instead of accepting a partial match', async () => {
    document.body.innerHTML = '<button id="http-contract">Run</button>';
    const observed: SendContextReplayExport['events'][number][] = [];
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'http-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#http-contract', action: 'click' },
        },
        {
          id: 'http-start',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'http',
          phase: 'started',
          operationId: 'recorded-http',
          payload: {
            source: 'browser-fetch',
            method: 'POST',
            url: 'http://localhost/api/users',
            body: '{"name":"Ada"}',
          },
        },
        {
          id: 'http-finish',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'http',
          phase: 'succeeded',
          operationId: 'recorded-http',
          response: {
            source: 'browser-fetch-response',
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: '{}',
          },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'create-user',
      scenarioVersion: 1,
      reason: 'The submitted user name is meaningful.',
      checkpoints: [],
      visualAssertions: [],
      eventAssertions: [
        {
          id: 'submit-user',
          kind: 'http',
          expected: {
            method: 'POST',
            url: 'http://localhost/api/users',
            body: '{"name":"Ada"}',
          },
        },
      ],
      tolerances: [],
    };
    const result = await runReplayTest(session, JSON.stringify(scenario), {
      observedEvents: () => observed,
      onTimelineAdvance: (elapsedMs) => {
        if (elapsedMs === 1 && observed.length === 0)
          observed.push({
            id: 'actual-http',
            sequence: 1,
            timestamp: 11,
            elapsedMs: 1,
            kind: 'http',
            phase: 'started',
            operationId: 'actual-http-op',
            payload: {
              source: 'browser-fetch',
              method: 'POST',
              url: 'http://localhost/api/users',
              body: '{"name":"Grace"}',
            },
          });
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      firstDifference: { eventId: 'scenario:submit-user' },
    });
  });

  it('fails on an unrecorded network request without calling the live fetch', async () => {
    document.body.innerHTML = '<button id="network-guard">Run</button>';
    const liveFetch = vi.fn(() => Promise.resolve(new Response('live')));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = liveFetch as unknown as typeof fetch;
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'guard-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#network-guard', action: 'click' },
        },
        {
          id: 'guard-call',
          sequence: 2,
          timestamp: 11,
          kind: 'craft',
          phase: 'started',
          name: 'loadData',
          operationId: 'guard-op',
          payload: {
            host: 'method:loadData',
            replayInvocation: {
              address: 'component:Home / method:loadData',
              args: [],
            },
          },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'offline-boundary',
      scenarioVersion: 1,
      reason: 'Network requests must come from the archive.',
      checkpoints: [{ id: 'guard-contract', path: '/ready', expected: true }],
      eventAssertions: [],
      visualAssertions: [],
      tolerances: [],
    };
    try {
      const result = await runReplayTest(session, JSON.stringify(scenario), {
        invokeRecordedMethod: async () => {
          await fetch('http://localhost/unrecorded');
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        classification: 'environment-or-adapter-missing',
      });
      expect(liveFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('ignores informative DOM targets unless the scenario asserts them', async () => {
    document.body.innerHTML = '';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'missing-button-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#moved-by-redesign', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const scenario = {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: 'visual-insensitive',
      scenarioVersion: 1,
      reason: 'DOM placement is informative for this business test.',
      checkpoints: [{ id: 'state', path: '/ready', expected: true }],
      eventAssertions: [],
      visualAssertions: [],
      tolerances: [],
    };
    expect(
      await runReplayTest(session, JSON.stringify(scenario), {
        readState: () => ({ ready: true }),
      }),
    ).toMatchObject({ status: 'passed' });

    const visualScenario = {
      ...scenario,
      id: 'visual-required',
      visualAssertions: [
        {
          id: 'save-button',
          targetId: 'save-button',
          expected: { present: true, role: 'button' },
        },
      ],
    };
    expect(
      await runReplayTest(session, JSON.stringify(visualScenario), {
        readState: () => ({ ready: true }),
      }),
    ).toMatchObject({
      status: 'failed',
      classification: 'visual-only',
      firstDifference: {
        eventId: 'visual:save-button',
        expected: { present: true, role: 'button' },
        actual: { present: false },
      },
    });
  });

  it('rejects invalid, incompatible and truncated exports', () => {
    expect(validateReplayExport('{')).toMatchObject({ ok: false });
    expect(
      validateReplayExport('{"format":"other","version":1}'),
    ).toMatchObject({ ok: false });
    expect(
      validateReplayExport(
        '{"format":"craft-debug-session","version":1,"startUrl":"/","exportedAt":0,"truncated":true,"events":[],"clips":[]}',
      ),
    ).toMatchObject({ ok: false });
  });

  it('accepts the empty route path emitted for the root route', () => {
    const rootRouteSession = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'root-route-started',
          sequence: 1,
          timestamp: 10,
          kind: 'route-load',
          phase: 'started',
          operationId: 'route-load:1',
          payload: {
            phase: 'component',
            routePath: '',
            targetUrl: '/',
          },
        },
        {
          id: 'root-route-succeeded',
          sequence: 2,
          timestamp: 11,
          kind: 'route-load',
          phase: 'succeeded',
          operationId: 'route-load:1',
          payload: {
            phase: 'component',
            routePath: '',
            targetUrl: '/',
            outcome: 'loaded',
          },
        },
      ],
    };

    expect(
      validateReplayExport(JSON.stringify(rootRouteSession)),
    ).toMatchObject({ ok: true });
  });

  it('reports an invalid routePath directly', () => {
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'invalid-route-path',
          sequence: 1,
          timestamp: 10,
          kind: 'route-load',
          phase: 'started',
          operationId: 'route-load:1',
          payload: {
            phase: 'component',
            routePath: 42,
            targetUrl: '/',
          },
        },
      ],
    };

    expect(validateReplayExport(JSON.stringify(session))).toMatchObject({
      ok: false,
      error: expect.stringContaining('invalid routePath'),
    });
  });

  it('validates bounded pending transitions without capturing application values', () => {
    const pendingSession = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'pending-started',
          sequence: 1,
          timestamp: 10,
          kind: 'pending',
          phase: 'started',
          operationId: 'pending:1:1',
          payload: {
            boundaryId: 1,
            source: 'users',
            mode: 'suspended',
            transition: 'visible',
            fallbackRendered: true,
          },
        },
        {
          id: 'pending-settled',
          sequence: 2,
          timestamp: 20,
          kind: 'pending',
          phase: 'succeeded',
          operationId: 'pending:1:1',
          payload: {
            boundaryId: 1,
            source: 'users',
            mode: 'suspended',
            transition: 'settled',
          },
        },
      ],
    };

    expect(validateReplayExport(JSON.stringify(pendingSession))).toMatchObject({
      ok: true,
    });
    const invalid = {
      ...pendingSession,
      events: pendingSession.events.map((event, index) =>
        index === 0
          ? { ...event, payload: { ...event.payload, source: 42 } }
          : event,
      ),
    };
    expect(validateReplayExport(JSON.stringify(invalid))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Pending transition event'),
    });
  });

  it('pairs replayed route phases by the observed operation identity', async () => {
    document.body.innerHTML = '<button id="navigate">Navigate</button>';
    const onWarning = vi.fn();
    const observedEvents: SendContextEvent[] = [];
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 10,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'navigation-click',
            sequence: 1,
            timestamp: 10,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#navigate', action: 'click' },
          },
          {
            id: 'recorded-route-start',
            sequence: 2,
            timestamp: 11,
            elapsedMs: 1,
            kind: 'route-load',
            phase: 'started',
            operationId: 'recorded-route:1',
            payload: {
              phase: 'component',
              routePath: 'users/:id',
              targetUrl: '/users/1',
            },
          },
          {
            id: 'recorded-route-end',
            sequence: 3,
            timestamp: 12,
            elapsedMs: 2,
            kind: 'route-load',
            phase: 'succeeded',
            operationId: 'recorded-route:1',
            payload: {
              phase: 'component',
              routePath: 'users/:id',
              targetUrl: '/users/1',
              outcome: 'loaded',
            },
          },
        ],
      },
      {
        observedEvents: () => observedEvents,
        onWarning,
        onInteraction: () => {
          observedEvents.push(
            {
              id: 'observed-route-start',
              sequence: 1,
              timestamp: 10,
              kind: 'route-load',
              phase: 'started',
              operationId: 'replay-route:9',
              payload: { routePath: 'users/:id', replay: true },
            },
            {
              id: 'observed-route-end',
              sequence: 2,
              timestamp: 20,
              kind: 'route-load',
              phase: 'succeeded',
              operationId: 'replay-route:9',
              payload: {
                routePath: 'users/:id',
                outcome: 'loaded',
                replay: true,
              },
            },
          );
        },
      },
    );

    await replay.step();

    expect(onWarning).not.toHaveBeenCalled();
    replay.stop();
  });

  it('maps pending operation identities across replay correlation IDs', async () => {
    document.body.innerHTML = '<button id="pending-action">Run</button>';
    const onWarning = vi.fn();
    const observedEvents: SendContextEvent[] = [];
    const pending = (id: string, phase: 'started' | 'succeeded') => ({
      id,
      sequence: phase === 'started' ? 1 : 2,
      timestamp: 10 + (phase === 'started' ? 0 : 1),
      kind: 'pending' as const,
      phase,
      operationId: 'recorded-pending:1',
      correlationId: 'click-correlation',
      payload: {
        boundaryId: 1,
        source: 'issue',
        mode: 'reloading',
        transition: phase === 'started' ? 'visible' : 'settled',
        ...(phase === 'started' ? { fallbackRendered: true } : {}),
      },
    });
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 10,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'pending-click',
            sequence: 0,
            timestamp: 10,
            kind: 'dom',
            phase: 'emitted',
            correlationId: 'click-correlation',
            payload: { selector: '#pending-action', action: 'click' },
          },
          {
            id: 'pending-trigger',
            sequence: 0.5,
            timestamp: 10,
            kind: 'craft',
            phase: 'started',
            operationId: 'mutation:1',
            correlationId: 'click-correlation',
            payload: {
              host: 'method:mutate',
              replayInvocation: { address: 'component:Issue#1 / method:mutate', args: ['issue-1'] },
            },
          },
          pending('pending-start', 'started'),
          pending('pending-end', 'succeeded'),
        ],
      },
      {
        observedEvents: () => observedEvents,
        onWarning,
        invokeRecordedMethod: () => undefined,
        onInteraction: () => {
          observedEvents.push(
            {
              ...pending('observed-start', 'started'),
              operationId: 'replay-pending:9',
              correlationId: 'replay-click-correlation',
              sequence: 1,
              payload: { ...pending('observed-start', 'started').payload, replay: true },
            },
            {
              ...pending('observed-end', 'succeeded'),
              operationId: 'replay-pending:9',
              correlationId: 'replay-click-correlation',
              sequence: 2,
              payload: { ...pending('observed-end', 'succeeded').payload, replay: true },
            },
          );
        },
      },
    );

    await replay.step();

    expect(onWarning).not.toHaveBeenCalled();
    replay.stop();
  });

  it('exports complete versioned, redacted sessions', () => {
    const session = createSendContextSession();
    session.capture('dom', 'emitted', {
      name: 'click',
      payload: { token: 'secret', selector: '#button', action: 'click' },
    });
    const exported = session.exportSessionJson();
    expect(validateReplayExport(exported)).toMatchObject({ ok: true });
    expect(JSON.parse(exported)).toMatchObject({ version: 5 });
    expect(exported).toContain('[REDACTED]');
  });

  it('replays a deferred activation semantically and checks its recorded outcome', async () => {
    const activation = {
      id: 'defer-activation',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 0,
      kind: 'defer',
      phase: 'started',
      payload: { targetId: 'stable-defer-target', trigger: 'interaction' },
    } as const;
    const outcome = {
      id: 'defer-outcome',
      sequence: 2,
      timestamp: 1_010,
      elapsedMs: 10,
      kind: 'defer',
      phase: 'succeeded',
      payload: {
        targetId: 'stable-defer-target',
        activationEventId: 'defer-activation',
        outcome: 'loaded',
      },
    } as const;
    let finishActivation!: (outcome: 'loaded') => void;
    const activationResult = new Promise<'loaded'>(
      (resolve) => (finishActivation = resolve),
    );
    const activate = vi.fn(() => activationResult);
    const onTimelineAdvance = vi.fn((elapsedMs: number) => {
      if (elapsedMs >= 10) finishActivation('loaded');
    });
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [activation, outcome],
      },
      {
        onDeferActivation: (_event, targetId) => {
          expect(targetId).toBe('stable-defer-target');
          return activate();
        },
        onTimelineAdvance,
      },
    );

    await replay.step();

    expect(activate).toHaveBeenCalledOnce();
    expect(onTimelineAdvance).toHaveBeenCalledWith(10);
    expect(replay.index()).toBe(1);
    replay.stop();
  });

  it('skipWait starts the next action now instead of after the recorded delay', async () => {
    document.body.innerHTML =
      '<button id="a">A</button><button id="b">B</button>';
    const states: string[] = [];
    const click = (id: string, sequence: number, timestamp: number) => ({
      id: `click-${id}`,
      sequence,
      timestamp,
      kind: 'dom' as const,
      phase: 'emitted' as const,
      name: 'click',
      payload: { selector: `#${id}`, action: 'click' },
    });
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        // A minute apart: without a skip the test would time out.
        events: [click('a', 1, 1_000), click('b', 2, 61_000)],
      },
      { onProgress: (_i, _n, state) => states.push(state) },
    );

    replay.play();
    await vi.waitFor(() => expect(replay.index()).toBe(1));
    replay.skipWait();
    await vi.waitFor(() => expect(replay.index()).toBe(2), { timeout: 3_000 });

    expect(states).toContain('completed');
    replay.stop();
  });

  it('warns when a click has no recorded Craft call or deferred activation', async () => {
    document.body.innerHTML = '<button id="native-only">Load</button>';
    const target = document.querySelector('#native-only')!;
    const handler = vi.fn();
    target.addEventListener('click', handler);
    const onWarning = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'native-only-click',
            sequence: 1,
            timestamp: 1_000,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#native-only', action: 'click' },
          },
        ],
      },
      { onWarning },
    );

    await replay.step();

    expect(handler).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('Aucun appel Craft ni activation différée'),
    );
    replay.stop();
  });

  it('accepts a deferred activation that is the next replay step after a click', async () => {
    document.body.innerHTML = '<button id="deferred">Load</button>';
    const onWarning = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'deferred-click',
            sequence: 1,
            timestamp: 1_000,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#deferred', action: 'click' },
          },
          {
            id: 'defer-started',
            sequence: 2,
            timestamp: 1_001,
            kind: 'defer',
            phase: 'started',
            payload: { targetId: 'deferred-target' },
          },
          {
            id: 'defer-succeeded',
            sequence: 3,
            timestamp: 1_002,
            kind: 'defer',
            phase: 'succeeded',
            payload: {
              targetId: 'deferred-target',
              activationEventId: 'defer-started',
              outcome: 'loaded',
            },
          },
        ],
      },
      { onWarning },
    );

    await replay.step();

    expect(onWarning).not.toHaveBeenCalledWith(
      expect.stringContaining('Aucun appel Craft ni activation différée'),
    );
    replay.stop();
  });

  it('keeps a later defer activation with its preceding click, before the next interaction', async () => {
    document.body.innerHTML =
      '<button id="deferred">Load</button><button id="other">Other</button>';
    const onWarning = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'deferred-click',
            sequence: 1,
            timestamp: 1_000,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#deferred', action: 'click' },
          },
          {
            id: 'method-started',
            sequence: 2,
            timestamp: 1_001,
            kind: 'craft',
            phase: 'started',
            name: 'method:load',
            payload: {
              host: 'method:load',
              replayInvocation: {
                address: 'component:App#1 / method:load',
                args: [],
              },
            },
          },
          {
            id: 'defer-started',
            sequence: 3,
            timestamp: 1_002,
            kind: 'defer',
            phase: 'started',
            payload: { targetId: 'deferred-target' },
          },
          {
            id: 'other-click',
            sequence: 4,
            timestamp: 1_003,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#other', action: 'click' },
          },
        ],
      },
      { onWarning },
    );

    await replay.step();

    expect(onWarning).not.toHaveBeenCalledWith(
      expect.stringContaining('Aucun appel Craft ni activation différée'),
    );
    replay.stop();
  });

  it('does not attach a defer activation after the next click to the previous click', async () => {
    document.body.innerHTML =
      '<button id="first">First</button><button id="second">Second</button>';
    const onWarning = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'first-click',
            sequence: 1,
            timestamp: 1_000,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#first', action: 'click' },
          },
          {
            id: 'second-click',
            sequence: 2,
            timestamp: 1_001,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            payload: { selector: '#second', action: 'click' },
          },
          {
            id: 'defer-started',
            sequence: 3,
            timestamp: 1_002,
            kind: 'defer',
            phase: 'started',
            payload: { targetId: 'second-target' },
          },
        ],
      },
      { onWarning },
    );

    await replay.step();

    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('Aucun appel Craft ni activation différée'),
    );
    replay.stop();
  });

  it('treats a document reload invocation as a non-replayable session boundary', async () => {
    document.body.innerHTML = '<button id="reload">Reload</button>';
    const invokeRecordedMethod = vi.fn();
    const onWarning = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'reload-click',
            sequence: 1,
            timestamp: 1_000,
            kind: 'dom',
            phase: 'emitted',
            name: 'click',
            correlationId: 'reload-click-id',
            payload: { selector: '#reload', action: 'click' },
          },
          {
            id: 'reload-method',
            sequence: 2,
            timestamp: 1_001,
            kind: 'craft',
            phase: 'started',
            name: 'method:reload',
            correlationId: 'reload-click-id',
            payload: {
              host: 'method:reload',
              replayInvocation: {
                address: 'service:BrowserLocationService#1 / method:reload',
                args: [],
              },
            },
          },
        ],
      },
      { invokeRecordedMethod, onWarning },
    );

    await replay.step();

    expect(invokeRecordedMethod).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('session boundary'),
    );
    replay.stop();
  });

  it('validates deferred activation identities and outcomes', () => {
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'defer-activation',
          sequence: 1,
          timestamp: 1_000,
          kind: 'defer',
          phase: 'started',
          payload: { targetId: 'stable-defer-target' },
        },
        {
          id: 'defer-result',
          sequence: 2,
          timestamp: 1_010,
          kind: 'defer',
          phase: 'succeeded',
          payload: {
            targetId: 'stable-defer-target',
            activationEventId: 'defer-activation',
            outcome: 'loaded',
          },
        },
      ],
    };
    expect(validateReplayExport(JSON.stringify(session))).toMatchObject({
      ok: true,
    });
    expect(
      validateReplayExport(
        JSON.stringify({
          ...session,
          events: [
            {
              ...session.events[0],
              payload: { targetId: '' },
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReplayExport(
        JSON.stringify({ ...session, events: [session.events[0]] }),
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('recorded result'),
    });
  });

  it('reports a deferred load that failed as recorded', async () => {
    const events = [
      {
        id: 'defer-activation-error',
        sequence: 1,
        timestamp: 1_000,
        kind: 'defer',
        phase: 'started',
        payload: { targetId: 'defer-error-target' },
      },
      {
        id: 'defer-error-result',
        sequence: 2,
        timestamp: 1_010,
        kind: 'defer',
        phase: 'failed',
        payload: {
          targetId: 'defer-error-target',
          activationEventId: 'defer-activation-error',
          outcome: 'error',
        },
      },
    ] as const;
    const onWarning = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events,
      },
      { onDeferActivation: async () => 'error', onWarning },
    );

    await replay.step();

    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('a échoué comme pendant l’enregistrement'),
    );
    expect(replay.index()).toBe(1);
    replay.stop();
  });

  it('rejects exports from every earlier replay format', () => {
    for (const version of [1, 2, 3, 4]) {
      const fixture = JSON.stringify({
        format: 'craft-debug-session',
        version,
        startUrl: 'http://localhost/',
        exportedAt: 10,
        truncated: false,
        events: [],
        clips: [],
      });
      expect(validateReplayExport(fixture)).toMatchObject({ ok: false });
    }
  });

  it('reports when an export comes from a newer unsupported schema', () => {
    const fixture = JSON.stringify({
      format: 'craft-debug-session',
      version: 6,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      events: [],
      clips: [],
    });

    expect(validateReplayExport(fixture)).toMatchObject({
      ok: false,
      error: expect.stringContaining('plus récent'),
    });
  });

  it('requires distinct replay keys for overlapping identical Craft HTTP requests', () => {
    const startEvent = (
      id: string,
      sequence: number,
      operationId: string,
      elapsedMs: number,
      replayKey?: string,
    ) => ({
      id,
      sequence,
      timestamp: elapsedMs,
      elapsedMs,
      kind: 'http',
      phase: 'started',
      operationId,
      payload: {
        source: 'craft-http-client',
        method: 'GET',
        url: '/same-request',
        ...(replayKey === undefined ? {} : { replayKey }),
      },
    });
    const finishEvent = (
      id: string,
      sequence: number,
      operationId: string,
      elapsedMs: number,
    ) => ({
      id,
      sequence,
      timestamp: elapsedMs,
      elapsedMs,
      kind: 'http',
      phase: 'succeeded',
      operationId,
      response: { result: operationId },
    });
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 100,
      truncated: false,
      clips: [],
      events: [
        startEvent('first-start', 1, 'first', 0),
        startEvent('second-start', 2, 'second', 10),
        finishEvent('second-finish', 3, 'second', 50),
        finishEvent('first-finish', 4, 'first', 100),
      ],
    };
    const json = JSON.stringify(session);

    expect(validateDebugSessionExport(json)).toMatchObject({ ok: true });
    expect(validateReplayExport(json)).toMatchObject({
      ok: false,
      error: expect.stringContaining('distinct replayKey'),
    });
    expect(
      validateReplayExport(
        JSON.stringify({
          ...session,
          events: [
            startEvent('first-start', 1, 'first', 0, 'profile-a'),
            startEvent('second-start', 2, 'second', 10, 'profile-b'),
            finishEvent('second-finish', 3, 'second', 50),
            finishEvent('first-finish', 4, 'first', 100),
          ],
        }),
      ),
    ).toMatchObject({ ok: true });
  });

  it('keeps sessions inspectable but refuses redacted or unsupported method arguments', () => {
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'method-start',
          sequence: 1,
          timestamp: 10,
          kind: 'craft',
          phase: 'started',
          operationId: 'method-1',
          payload: {
            host: 'method:saveProfile',
            replayInvocation: {
              address: 'component:Profile#1 / method:saveProfile',
              args: [{ password: '[REDACTED]' }],
            },
          },
        },
      ],
    };
    const json = JSON.stringify(session);

    expect(validateDebugSessionExport(json)).toMatchObject({ ok: true });
    expect(validateReplayExport(json)).toMatchObject({
      ok: false,
      error: expect.stringContaining('non sérialisable ou expurgé'),
    });
  });

  it('validates transport instances and rejects non-replayable payloads', () => {
    const base = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'transport-1',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 5,
          kind: 'transport',
          phase: 'emitted',
          payload: {
            transportId: 'notifications',
            transport: 'websocket',
            instanceId: 'socket-1',
            direction: 'incoming',
            messageType: 'message',
            sequence: 1,
            elapsedMs: 5,
            data: { codec: 'text', value: 'hello' },
            replayable: true,
          },
        },
      ],
    };
    expect(validateReplayExport(JSON.stringify(base))).toMatchObject({
      ok: true,
    });
    expect(
      validateReplayExport(
        JSON.stringify({
          ...base,
          events: [
            {
              ...base.events[0],
              payload: {
                ...base.events[0]!.payload,
                replayable: false,
                reason: 'message-too-large',
              },
            },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('message-too-large'),
    });
    expect(
      validateReplayExport(
        JSON.stringify({
          ...base,
          events: [
            {
              ...base.events[0],
              payload: { ...base.events[0]!.payload, sequence: 0 },
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('invalid') });
  });

  it('accepts sessions with more than 10,000 events without dropping entries', () => {
    const events = Array.from({ length: 10_001 }, (_, index) => ({
      id: `event-${index + 1}`,
      sequence: index + 1,
      timestamp: index + 1,
      kind: 'craft',
      phase: 'started',
    }));
    const validation = validateDebugSessionExport(
      JSON.stringify({
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 10_001,
        truncated: false,
        events,
        clips: [],
      }),
    );

    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.session.events).toHaveLength(10_001);
  });

  it('accepts recorded viewport metadata and rejects invalid dimensions', () => {
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      events: [],
      clips: [],
      viewport: { width: 1280, height: 720 },
    };

    expect(validateReplayExport(JSON.stringify(session))).toMatchObject({
      ok: true,
      session: { viewport: { width: 1280, height: 720 } },
    });
    expect(
      validateReplayExport(
        JSON.stringify({ ...session, viewport: { width: 0, height: 720 } }),
      ),
    ).toMatchObject({ ok: false });
  });

  it('rejects replay actions without a selector or action', () => {
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      events: [
        {
          id: 'event-1',
          sequence: 1,
          timestamp: 1,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '[', action: '' },
        },
      ],
      clips: [],
    };

    expect(validateReplayExport(JSON.stringify(session))).toMatchObject({
      ok: false,
      error: expect.stringContaining('invalid selector or action'),
    });
  });

  it('stops safely when an imported selector is syntactically invalid', async () => {
    const errors: string[] = [];
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'invalid-selector',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '[', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      onError: (message) => errors.push(message),
    });

    await expect(replay.step()).resolves.toBeUndefined();

    expect(errors[0]).toContain('selector is invalid or not found');
    expect(replay.index()).toBe(0);
  });

  it('does not fall back to CSS when a Craft identity belongs to another runtime', async () => {
    document.body.innerHTML = '<button id="same-looking-target"></button>';
    const target = document.querySelector('button')!;
    const unregister = ɵregisterCraftReplayTarget(target, ['Orders', 'delete']);
    const replayTarget = ɵcaptureCraftReplayTarget(target)!;
    unregister();
    const errors: string[] = [];
    const onInteraction = vi.fn();
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'foreign-target',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 0,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: {
            selector: '#same-looking-target',
            action: 'click',
            replayTarget: { ...replayTarget, runtimeId: 'another-runtime' },
          },
        },
      ],
    };
    const replay = createReplayController(session, {
      onError: (message) => errors.push(message),
      onInteraction,
    });

    await replay.step();

    expect(errors[0]).toContain('foreign-runtime');
    expect(onInteraction).not.toHaveBeenCalled();
    expect(replay.index()).toBe(0);
    replay.stop();
  });

  it('matches only recorded browser fetches and never falls through', async () => {
    const started = {
      id: 'start',
      sequence: 1,
      timestamp: 1,
      kind: 'http',
      phase: 'started',
      operationId: 'op',
      payload: {
        source: 'browser-fetch',
        method: 'GET',
        url: 'https://example.test/api',
      },
    } as const;
    const finished = {
      id: 'end',
      sequence: 2,
      timestamp: 2,
      kind: 'http',
      phase: 'succeeded',
      operationId: 'op',
      response: {
        source: 'browser-fetch-response',
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: [1] }),
      },
    } as const;
    const resolver = createRecordedResponseResolver({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'https://example.test/',
      exportedAt: 2,
      truncated: false,
      events: [started, finished],
      clips: [],
    });
    const response = await resolver(new Request('http://localhost/api'));
    expect(await response?.json()).toEqual({ data: [1] });
    expect(
      await resolver(new Request('http://localhost/unrecorded')),
    ).toBeUndefined();
  });

  it('requires a local redaction tolerance for redacted HTTP fixtures', async () => {
    const resolver = createRecordedResponseResolver(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 2,
        truncated: false,
        events: [
          {
            id: 'strict-start',
            sequence: 1,
            timestamp: 1,
            kind: 'http',
            phase: 'started',
            operationId: 'strict-op',
            payload: {
              source: 'browser-fetch',
              method: 'POST',
              url: 'http://localhost/api/items?kind=book',
              body: '{"name":"[REDACTED]"}',
            },
          },
          {
            id: 'strict-finish',
            sequence: 2,
            timestamp: 2,
            kind: 'http',
            phase: 'succeeded',
            operationId: 'strict-op',
            response: {
              source: 'browser-fetch-response',
              status: 200,
              headers: {},
              body: '{}',
            },
          },
        ],
        clips: [],
      },
      {
        format: 'craft-replay-scenario',
        schemaVersion: 1,
        id: 'strict-fixture',
        scenarioVersion: 1,
        reason: 'Exercise strict fixture matching.',
        checkpoints: [],
        eventAssertions: [
          {
            id: 'request',
            kind: 'http',
            expected: {
              method: 'POST',
              url: 'http://localhost/api/items?kind=book',
              body: { name: '[REDACTED]' },
            },
          },
        ],
        visualAssertions: [],
        tolerances: [
          { assertionId: 'request', path: '/body/name', kind: 'redacted' },
        ],
      },
    );

    expect(
      await resolver(
        new Request('http://localhost/api/items?kind=book&debug=1', {
          method: 'POST',
          body: '{"name":"Ada"}',
        }),
      ),
    ).toBeUndefined();
    expect(
      await resolver(
        new Request('http://localhost/api/items?kind=book', {
          method: 'POST',
          body: '{"name":"Ada","extra":true}',
        }),
      ),
    ).toBeUndefined();
    expect(
      await resolver(
        new Request('http://localhost/api/items?kind=book', {
          method: 'POST',
          body: '{"name":"Ada"}',
        }),
      ),
    ).toBeInstanceOf(Response);
  });

  it('restores binary browser fetch responses byte for byte', async () => {
    const resolver = createRecordedResponseResolver({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 2,
      truncated: false,
      events: [
        {
          id: 'start',
          sequence: 1,
          timestamp: 1,
          kind: 'http',
          phase: 'started',
          operationId: 'binary-op',
          payload: {
            source: 'browser-fetch',
            method: 'GET',
            url: 'http://localhost/api/file',
          },
        },
        {
          id: 'end',
          sequence: 2,
          timestamp: 2,
          kind: 'http',
          phase: 'succeeded',
          operationId: 'binary-op',
          response: {
            source: 'browser-fetch-response',
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
            body: { encoding: 'base64', data: 'AAEC/v8=' },
          },
        },
      ],
      clips: [],
    });

    const response = await resolver(new Request('http://localhost/api/file'));
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual([
      0, 1, 2, 254, 255,
    ]);
  });

  it('replays a recorded browser fetch failure without making a live request', async () => {
    const resolver = createRecordedResponseResolver({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 2,
      truncated: false,
      events: [
        {
          id: 'fetch-start',
          sequence: 1,
          timestamp: 1,
          kind: 'http',
          phase: 'started',
          operationId: 'failed-fetch',
          payload: {
            source: 'browser-fetch',
            method: 'GET',
            url: 'http://localhost/api/failure',
          },
        },
        {
          id: 'fetch-failed',
          sequence: 2,
          timestamp: 2,
          kind: 'http',
          phase: 'failed',
          operationId: 'failed-fetch',
          response: { message: 'Recorded offline failure' },
        },
      ],
      clips: [],
    });
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('live')));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const restoreFetch = installReplayNetworkGuard(resolver);
    try {
      await expect(
        globalThis.fetch('http://localhost/api/failure'),
      ).rejects.toThrow('Recorded offline failure');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      restoreFetch();
      globalThis.fetch = originalFetch;
    }
  });

  it('releases a recorded browser fetch response at its timeline position', async () => {
    const resolver = createRecordedResponseResolver({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 50,
      truncated: false,
      events: [
        {
          id: 'click',
          sequence: 1,
          timestamp: 1,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#search', action: 'click' },
        },
        {
          id: 'fetch-start',
          sequence: 2,
          timestamp: 2,
          elapsedMs: 2,
          kind: 'http',
          phase: 'started',
          operationId: 'search',
          payload: {
            source: 'browser-fetch',
            method: 'POST',
            url: 'http://localhost/api/search',
            body: '{"term":"recorded"}',
          },
        },
        {
          id: 'fetch-finish',
          sequence: 3,
          timestamp: 50,
          elapsedMs: 50,
          kind: 'http',
          phase: 'succeeded',
          operationId: 'search',
          response: {
            source: 'browser-fetch-response',
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: '{"result":"recorded"}',
          },
        },
      ],
      clips: [],
    });
    resolver.enableTimeline();

    let responseReady = false;
    const responsePromise = resolver(
      new Request('http://localhost/api/search', {
        method: 'POST',
        body: '{"term":"recorded"}',
      }),
    ).then((response) => {
      responseReady = true;
      return response;
    });
    await Promise.resolve();
    expect(responseReady).toBe(false);

    resolver.advanceTo(49);
    await Promise.resolve();
    expect(responseReady).toBe(false);

    resolver.advanceTo(50);
    await expect(
      responsePromise.then((response) => response?.json()),
    ).resolves.toEqual({
      result: 'recorded',
    });
  });

  it('shows a click without redispatching it and invokes root Craft calls in order', async () => {
    document.body.innerHTML = '<button id="invocation-replay">Run</button>';
    const target = document.querySelector('#invocation-replay')!;
    const click = vi.fn();
    target.addEventListener('click', click);
    const invocations: string[] = [];
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: { selector: '#invocation-replay', action: 'click' },
        },
        {
          id: 'method-root',
          sequence: 2,
          timestamp: 11,
          kind: 'craft' as const,
          phase: 'started' as const,
          operationId: 'root',
          correlationId: 'click-correlation',
          payload: {
            host: 'method:openPanel',
            replayInvocation: {
              address: 'component:App#1 / method:openPanel',
              args: [],
            },
          },
        },
        {
          id: 'method-root-with-args',
          sequence: 2.5,
          timestamp: 11,
          kind: 'craft' as const,
          phase: 'started' as const,
          operationId: 'root-with-args',
          correlationId: 'click-correlation',
          payload: {
            host: 'method:openPanel',
            replayInvocation: {
              address: 'component:App#1 / method:openPanel',
              args: ['settings'],
            },
          },
        },
        {
          id: 'method-nested',
          sequence: 3,
          timestamp: 12,
          kind: 'craft' as const,
          phase: 'started' as const,
          operationId: 'nested',
          payload: {
            host: 'method:setOpen',
            replayInvocation: {
              address: 'component:App#1 / method:setOpen',
              args: [true],
              parentOperationId: 'root',
            },
          },
        },
        {
          id: 'method-next-root',
          sequence: 4,
          timestamp: 13,
          kind: 'craft' as const,
          phase: 'started' as const,
          operationId: 'next-root',
          payload: {
            host: 'method:trackOpen',
            replayInvocation: {
              address: 'component:App#1 / method:trackOpen',
              args: [true],
            },
          },
        },
      ],
    } satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      invokeRecordedMethod: (event) => {
        invocations.push(event.name ?? event.operationId ?? '');
      },
    });

    await replay.step();

    expect(click).not.toHaveBeenCalled();
    expect(invocations).toEqual(['root-with-args', 'next-root']);
    expect(replay.index()).toBe(1);
    replay.stop();
  });

  it('advances the recorded timeline while a deferred route load is still settling', async () => {
    document.body.innerHTML = '<a id="navigate">Open route</a>';
    const replayRef: {
      current?: ReturnType<typeof createReplayController>;
    } = {};
    const loadChildren = vi.fn(async () => {
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 250;
        const poll = setInterval(() => {
          if ((replayRef.current?.clock.now() ?? 0) >= 110) {
            clearInterval(poll);
            clearTimeout(timeout);
            resolve();
          } else if (Date.now() >= deadline) {
            clearInterval(poll);
            reject(
              new Error('Deferred route load waited for the replay clock.'),
            );
          }
        }, 1);
        const timeout = setTimeout(() => {
          clearInterval(poll);
          reject(new Error('Deferred route load waited for the replay clock.'));
        }, 300);
      });
    });
    const navigateToRecordedRoute = vi.fn(() => loadChildren());
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 100,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'navigation-start',
          sequence: 1,
          timestamp: 101,
          name: 'NavigationStart',
          kind: 'navigation' as const,
          phase: 'started' as const,
          payload: {
            url: '/slow-route',
            navigationOptions: { replaceUrl: true },
          },
        },
        {
          id: 'navigation-click',
          sequence: 2,
          timestamp: 101,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: {
            selector: '#navigate',
            action: 'click',
            href: 'http://localhost/slow-route',
          },
        },
        {
          id: 'route-settled-checkpoint',
          sequence: 3,
          timestamp: 110,
          kind: 'primitive' as const,
          phase: 'emitted' as const,
          state: { route: '/slow-route' },
        },
      ],
    } satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      invokeRecordedMethod: () => undefined,
      navigateToRecordedRoute,
    });
    replayRef.current = replay;

    await expect(replay.step()).resolves.toBeUndefined();

    expect(navigateToRecordedRoute).toHaveBeenCalledWith('/slow-route', {
      replaceUrl: true,
    });
    expect(loadChildren).toHaveBeenCalledOnce();
    expect(replay.clock.now()).toBe(110);
    expect(replay.index()).toBe(1);
    replay.stop();
  });

  it('rejects unknown live requests during replay', async () => {
    let unmatched = false;
    const restore = installReplayNetworkGuard(
      async () => undefined,
      () => {
        unmatched = true;
      },
    );
    try {
      await expect(fetch('http://localhost/unrecorded')).rejects.toThrow(
        /no recorded response/,
      );
      expect(unmatched).toBe(true);
    } finally {
      restore();
    }
  });

  it('installs the replay network guard when the controller is created', async () => {
    const nativeFetch = globalThis.fetch;
    const errors: string[] = [];
    const session = {
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      events: [],
      clips: [],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      invokeRecordedMethod: () => undefined,
      onError: (error) => errors.push(error),
    });

    try {
      await expect(fetch('http://localhost/unrecorded')).rejects.toThrow(
        /no recorded response/,
      );
      expect(errors[0]).toContain('no recorded response');
    } finally {
      replay.stop();
    }
    expect(globalThis.fetch).toBe(nativeFetch);
  });

  it('replays legacy source$ pointerdowns before comparing their Craft effects', async () => {
    document.body.innerHTML =
      '<button id="outside-menu">Open destination</button>';
    const target = document.querySelector('#outside-menu')!;
    const observed: Array<Record<string, unknown>> = [];
    target.addEventListener('pointerdown', () => {
      observed.push({
        id: 'actual-close-start',
        sequence: 1,
        timestamp: 1,
        kind: 'craft',
        phase: 'started',
        name: 'method:close',
        payload: { comparable: true },
      });
      observed.push({
        id: 'actual-close-end',
        sequence: 2,
        timestamp: 2,
        kind: 'craft',
        phase: 'succeeded',
        name: 'method:close',
        payload: { comparable: true },
      });
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 3,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'legacy-pointerdown',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 0,
          kind: 'custom',
          phase: 'emitted',
          name: 'pointerdown',
          source: 'source$',
          payload: { isTrusted: true },
        },
        {
          id: 'close-start',
          sequence: 2,
          timestamp: 2,
          elapsedMs: 1,
          kind: 'craft',
          phase: 'started',
          name: 'method:close',
          payload: { comparable: true },
        },
        {
          id: 'close-end',
          sequence: 3,
          timestamp: 3,
          elapsedMs: 2,
          kind: 'craft',
          phase: 'succeeded',
          name: 'method:close',
          payload: { comparable: true },
        },
        {
          id: 'following-click',
          sequence: 4,
          timestamp: 126,
          elapsedMs: 125,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#outside-menu',
            action: 'click',
            clientX: 20,
            clientY: 10,
          },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      observedEvents: () => observed as never,
    });

    await expect(replay.step()).resolves.toBeUndefined();

    expect(observed).toHaveLength(2);
    expect(replay.index()).toBe(1);
    replay.stop();
  });

  it('keeps captured DOM actions visual while advancing the virtual clock', async () => {
    document.body.innerHTML = '<button id="replay-target">Go</button>';
    const target = document.querySelector('#replay-target')!;
    let clicks = 0;
    target.addEventListener('click', () => clicks++);
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 2_000,
      truncated: false,
      clips: [],
      events: [1_000, 2_000].map((timestamp, index) => ({
        id: `e${index}`,
        sequence: index + 1,
        timestamp,
        kind: 'dom' as const,
        phase: 'emitted' as const,
        payload: { selector: '#replay-target', action: 'click' },
      })),
    };
    const replay = createReplayController(session);
    let timerRan = false;
    replay.clock.schedule(() => {
      timerRan = true;
    }, 500);
    await replay.step();
    expect(clicks).toBe(0);
    expect(timerRan).toBe(false);
    expect(replay.clock.now()).toBe(1_000);
    await replay.step();
    expect(clicks).toBe(0);
    expect(timerRan).toBe(true);
    expect(replay.clock.now()).toBe(2_000);
    replay.stop();
  });

  it('does not dispatch pointerdown (including long press), keyboard, input, or change events in invocation replay', async () => {
    document.body.innerHTML = '<input id="visual-only">';
    const target = document.querySelector<HTMLInputElement>('#visual-only')!;
    const actions = ['pointerdown', 'keydown', 'input', 'change'] as const;
    const handlers = actions.map(() => vi.fn());
    actions.forEach((action, index) =>
      target.addEventListener(action, handlers[index]!),
    );
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: actions.map((action, index) => ({
        id: `visual-${action}`,
        sequence: index + 1,
        timestamp: 10 + index,
        kind: 'dom' as const,
        phase: 'emitted' as const,
        payload: { selector: '#visual-only', action },
      })),
    };
    const replay = createReplayController(session);

    for (const _action of actions) await replay.step();

    expect(handlers.every((handler) => handler.mock.calls.length === 0)).toBe(
      true,
    );
    replay.stop();
  });

  it('replays hover as a visual-only step without dispatching or invoking handlers', async () => {
    document.body.innerHTML = '<button id="hover-target">Open</button>';
    const target = document.querySelector('#hover-target')!;
    const dispatchSpy = vi.fn();
    target.addEventListener('pointerover', dispatchSpy);
    const onInteraction = vi.fn();
    const invokeRecordedMethod = vi.fn();
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'hover-enter',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'hover' as const,
          phase: 'emitted' as const,
          name: 'hover:enter',
          payload: {
            action: 'enter',
            selector: '#hover-target',
            clientX: 25,
            clientY: 15,
          },
        },
        {
          id: 'hover-leave',
          sequence: 2,
          timestamp: 20,
          elapsedMs: 10,
          kind: 'hover' as const,
          phase: 'emitted' as const,
          name: 'hover:leave',
          payload: {
            action: 'leave',
            selector: '#hover-target',
            clientX: 30,
            clientY: 20,
          },
        },
      ],
    };
    const replay = createReplayController(session, {
      onInteraction,
      invokeRecordedMethod,
    });

    expect(getReplaySteps(session.events)).toHaveLength(2);
    await replay.step();

    expect(onInteraction).toHaveBeenCalledWith(session.events[0], target);
    target.remove();
    await replay.step();
    expect(onInteraction).toHaveBeenLastCalledWith(
      session.events[1],
      document.body,
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(invokeRecordedMethod).not.toHaveBeenCalled();
    expect(replay.index()).toBe(2);
    replay.stop();
  });

  it('shows a coordinate fallback and continues when a hover target is missing', async () => {
    document.body.innerHTML = '<button id="next-hover">Next</button>';
    const onInteraction = vi.fn();
    const onWarning = vi.fn();
    const onError = vi.fn();
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'missing-hover',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'hover' as const,
          phase: 'emitted' as const,
          name: 'hover:enter',
          payload: {
            action: 'enter',
            selector: '#removed-before-replay',
            clientX: 25,
            clientY: 15,
          },
        },
        {
          id: 'next-hover',
          sequence: 2,
          timestamp: 20,
          elapsedMs: 10,
          kind: 'hover' as const,
          phase: 'emitted' as const,
          name: 'hover:enter',
          payload: {
            action: 'enter',
            selector: '#next-hover',
            clientX: 40,
            clientY: 20,
          },
        },
      ],
    };
    const replay = createReplayController(session, {
      onInteraction,
      onWarning,
      onError,
    });

    await replay.step();

    expect(onError).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('hover target selector was not found'),
    );
    expect(onInteraction).toHaveBeenCalledWith(
      session.events[0],
      document.body,
    );
    expect(replay.index()).toBe(1);

    await replay.step();

    expect(onInteraction).toHaveBeenLastCalledWith(
      session.events[1],
      document.querySelector('#next-hover'),
    );
    expect(replay.index()).toBe(2);
    replay.stop();
  });

  it('drains a linked async Craft interval after the final visual hover', async () => {
    document.body.innerHTML = '<button id="hover-target">Open</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'recorded-click',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          correlationId: 'click-1',
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: {
            action: 'click',
            selector: '#hover-target',
          },
        },
        {
          id: 'final-hover',
          sequence: 2,
          timestamp: 20,
          elapsedMs: 10,
          kind: 'hover' as const,
          phase: 'emitted' as const,
          payload: {
            action: 'enter',
            selector: '#hover-target',
          },
        },
        {
          id: 'async-settled-call',
          sequence: 3,
          timestamp: 110,
          elapsedMs: 100,
          correlationId: 'async-1',
          kind: 'craft' as const,
          phase: 'started' as const,
          payload: { comparable: false },
        },
      ],
    } satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      invokeRecordedMethod: () => undefined,
    });

    await replay.step();
    await replay.step();

    expect(replay.clock.now()).toBe(100);
    expect(replay.index()).toBe(2);
    replay.stop();
  });

  it('applies captured native form values before replaying later Craft methods', async () => {
    document.body.innerHTML = '<input id="title">';
    const input = document.querySelector<HTMLInputElement>('#title')!;
    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    input.addEventListener('input', inputHandler);
    input.addEventListener('change', changeHandler);
    const invokeRecordedMethod = vi.fn();
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'native-input',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          name: 'native:input',
          payload: {
            action: 'input',
            selector: '#title',
            value: 'Replay todo',
            valueOnly: true,
          },
        },
      ],
    };
    const replay = createReplayController(session, { invokeRecordedMethod });

    await replay.step();

    expect(input.value).toBe('Replay todo');
    expect(inputHandler).not.toHaveBeenCalled();
    expect(changeHandler).not.toHaveBeenCalled();
    expect(invokeRecordedMethod).not.toHaveBeenCalled();
    expect(replay.index()).toBe(1);
    replay.stop();
  });

  it('shows the native select options in a replay-only presentation', async () => {
    document.body.innerHTML =
      '<select id="country"><option value="fr">France</option><option value="ca">Canada</option></select>';
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 10,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'select-open',
            sequence: 1,
            timestamp: 10,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#country', action: 'select-open' },
          },
          {
            id: 'select-close',
            sequence: 2,
            timestamp: 20,
            elapsedMs: 10,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#country',
              action: 'change',
              value: 'ca',
              valueOnly: true,
            },
          },
        ],
      },
      { invokeRecordedMethod: () => undefined },
    );

    await replay.step();
    const overlay = document.querySelector<HTMLElement>(
      '[data-craft-select-replay-overlay]',
    );
    expect(overlay?.textContent).toContain('France');
    expect(overlay?.textContent).toContain('Canada');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');

    await replay.step();
    expect(document.querySelector<HTMLSelectElement>('#country')?.value).toBe(
      'ca',
    );
    expect(
      document.querySelector('[data-craft-select-replay-overlay]'),
    ).toBeNull();
    replay.stop();
  });

  it('restores opted-in checkbox state and native disclosure state', async () => {
    document.body.innerHTML =
      '<input id="subscribe" type="checkbox"><details id="faq"><summary>FAQ</summary></details><dialog id="notice"></dialog><div id="help" popover></div>';
    const checkbox = document.querySelector<HTMLInputElement>('#subscribe')!;
    const dialog = document.querySelector<HTMLDialogElement>('#notice')!;
    const dialogShowModal = vi.fn();
    Object.defineProperty(dialog, 'showModal', {
      configurable: true,
      value: dialogShowModal,
    });
    const popover = document.querySelector<HTMLElement>('#help')!;
    const popoverShow = vi.fn();
    Object.defineProperty(popover, 'showPopover', {
      configurable: true,
      value: popoverShow,
    });
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 10,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'check-subscribe',
            sequence: 1,
            timestamp: 10,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#subscribe',
              action: 'change',
              checked: true,
            },
          },
          {
            id: 'open-faq',
            sequence: 2,
            timestamp: 20,
            elapsedMs: 10,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#faq',
              action: 'details-open',
              stateKind: 'details',
              open: true,
            },
          },
          {
            id: 'open-notice',
            sequence: 3,
            timestamp: 30,
            elapsedMs: 20,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#notice',
              action: 'dialog-open',
              stateKind: 'dialog',
              open: true,
              modal: true,
            },
          },
          {
            id: 'open-help',
            sequence: 4,
            timestamp: 40,
            elapsedMs: 30,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#help',
              action: 'popover-open',
              stateKind: 'popover',
              open: true,
            },
          },
        ],
      },
      { invokeRecordedMethod: () => undefined },
    );

    await replay.step();
    expect(checkbox.checked).toBe(true);
    await replay.step();
    expect(document.querySelector('details')?.open).toBe(true);
    await replay.step();
    expect(dialogShowModal).toHaveBeenCalledOnce();
    await replay.step();
    expect(popoverShow).toHaveBeenCalledOnce();
    replay.stop();
  });

  it('shows a replay cue for native pickers and warns that file selections cannot be restored', async () => {
    document.body.innerHTML =
      '<input id="birthday" type="date"><input id="attachment" type="file">';
    const warnings: string[] = [];
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 10,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'date-open',
            sequence: 1,
            timestamp: 10,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#birthday',
              action: 'picker-open',
              controlType: 'date',
            },
          },
          {
            id: 'files-selected',
            sequence: 2,
            timestamp: 20,
            elapsedMs: 10,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '#attachment',
              action: 'file-selection',
              fileCount: 1,
              replayable: false,
            },
          },
        ],
      },
      {
        invokeRecordedMethod: () => undefined,
        onWarning: (message) => warnings.push(message),
      },
    );

    await replay.step();
    expect(
      document.querySelector('[data-craft-select-replay-overlay]')?.textContent,
    ).toContain('date');
    await replay.step();
    expect(warnings.join(' ')).toContain('ne peut pas être restaurée');
    expect(
      document.querySelector('[data-craft-select-replay-overlay]'),
    ).toBeNull();
    replay.stop();
  });

  it('restores the recorded page scroll before replaying a click', async () => {
    document.body.innerHTML =
      '<div id="replay-scroller"><button id="scrolled-replay">Save</button></div>';
    const target = document.querySelector('#scrolled-replay')!;
    const scroller = document.querySelector<HTMLElement>('#replay-scroller')!;
    const clickHandler = vi.fn();
    target.addEventListener('click', clickHandler);
    const scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const recordedInteraction = {
      id: 'scroll-click',
      sequence: 1,
      timestamp: 1_000,
      kind: 'dom' as const,
      phase: 'emitted' as const,
      payload: {
        selector: '#scrolled-replay',
        action: 'click',
        clientX: 150,
        clientY: 80,
        scrollX: 0,
        scrollY: 640,
        scrollAncestors: [
          {
            selector: '#replay-scroller',
            scrollLeft: 0,
            scrollTop: 321,
          },
        ],
      },
    };
    const onInteraction = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [recordedInteraction],
      },
      { onInteraction },
    );

    await replay.step();

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 640,
      behavior: 'instant',
    });
    expect(scroller.scrollTop).toBe(321);
    expect(clickHandler).not.toHaveBeenCalled();
    expect(onInteraction).toHaveBeenCalledWith(recordedInteraction, target);
    replay.stop();
    scrollTo.mockRestore();
  });

  it('replays standalone viewport scroll steps without waiting for a click', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    const scrollStep = {
      id: 'standalone-scroll',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 50,
      kind: 'scroll' as const,
      phase: 'emitted' as const,
      name: 'Viewport scroll',
      payload: { target: 'viewport', scrollX: 0, scrollY: 420 },
    };
    const onScroll = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [scrollStep],
      },
      { onScroll },
    );

    await replay.step();

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 420,
      behavior: 'instant',
    });
    expect(onScroll).toHaveBeenCalledWith(scrollStep);
    expect(replay.index()).toBe(1);
    replay.stop();
    scrollTo.mockRestore();
  });

  it('replays viewport size changes in order and awaits each resize', async () => {
    const portrait = {
      id: 'viewport-portrait',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 50,
      kind: 'viewport' as const,
      phase: 'emitted' as const,
      payload: { width: 390, height: 844 },
    };
    const landscape = {
      id: 'viewport-landscape',
      sequence: 2,
      timestamp: 1_000,
      elapsedMs: 125,
      kind: 'viewport' as const,
      phase: 'emitted' as const,
      payload: { width: 844, height: 390 },
    };
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [portrait, landscape],
    };
    const onViewport = vi.fn(async () => undefined);
    const onProgress = vi.fn();
    const replay = createReplayController(session, { onViewport, onProgress });

    await replay.step();
    await replay.step();

    expect(onViewport.mock.calls).toEqual([[portrait], [landscape]]);
    expect(replay.index()).toBe(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, 'completed');
    replay.stop();
  });

  it('reports a viewport resize failure without leaving the replay promise rejected', async () => {
    const viewportStep = {
      id: 'viewport-timeout',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 50,
      kind: 'viewport' as const,
      phase: 'emitted' as const,
      payload: { width: 390, height: 844 },
    };
    const onError = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [viewportStep],
      },
      {
        onViewport: async () => {
          throw new Error('viewport resize timed out');
        },
        onError,
      },
    );

    await expect(replay.step()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith('viewport resize timed out');
    expect(replay.index()).toBe(0);
  });

  it('replays a standalone nested scroll before the next interaction', async () => {
    document.body.innerHTML =
      '<div id="nested-scroller"><button id="after-scroll">Continue</button></div>';
    const scroller = document.querySelector<HTMLElement>('#nested-scroller')!;
    const target = document.querySelector<HTMLButtonElement>('#after-scroll')!;
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
        scroller.dispatchEvent(new Event('scroll'));
      },
    });
    let observedScrollAtClick = 0;
    target.addEventListener('click', () => {
      observedScrollAtClick = scroller.scrollTop;
    });
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'nested-scroll',
            sequence: 1,
            timestamp: 1_000,
            elapsedMs: 0,
            kind: 'scroll',
            phase: 'emitted',
            payload: {
              target: 'element',
              selector: '#nested-scroller',
              scrollLeft: 0,
              scrollTop: 260,
            },
          },
          {
            id: 'following-click',
            sequence: 2,
            timestamp: 1_500,
            elapsedMs: 500,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#after-scroll', action: 'click' },
          },
        ],
      },
      { mode: 'legacy-dom' },
    );

    await replay.step();
    await replay.step();

    expect(observedScrollAtClick).toBe(260);
    expect(replay.index()).toBe(2);
    replay.stop();
  });

  it('blocks application scroll and click handlers during replay presentation', async () => {
    document.body.innerHTML =
      '<button id="load-after-scroll">Continue</button>';
    const target = document.querySelector('#load-after-scroll')!;
    const scrollHandler = vi.fn();
    const clickHandler = vi.fn();
    window.addEventListener('scroll', scrollHandler, { once: true });
    target.addEventListener('click', clickHandler);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      window.setTimeout(() => {
        window.dispatchEvent(new Event('scroll'));
      }, 0);
    });
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'scroll-before-click',
          sequence: 1,
          timestamp: 1_000,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#load-after-scroll',
            action: 'click',
            scrollX: 0,
            scrollY: 640,
          },
        },
      ],
    });

    await replay.step();

    expect(scrollHandler).not.toHaveBeenCalled();
    expect(clickHandler).not.toHaveBeenCalled();
    window.removeEventListener('scroll', scrollHandler);
    replay.stop();
    scrollTo.mockRestore();
  });

  it('waits for actions triggered by a scrolled container before clicking', async () => {
    document.body.innerHTML =
      '<div id="lazy-list"><button id="lazy-item">Open</button></div>';
    const scroller = document.querySelector<HTMLElement>('#lazy-list')!;
    const target = document.querySelector('#lazy-item')!;
    const order: string[] = [];
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
        window.setTimeout(() => scroller.dispatchEvent(new Event('scroll')), 0);
      },
    });
    scroller.addEventListener('scroll', () => order.push('lazy-load'), {
      once: true,
    });
    target.addEventListener('click', () => order.push('recorded-click'));
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'container-scroll-before-click',
          sequence: 1,
          timestamp: 1_000,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#lazy-item',
            action: 'click',
            scrollAncestors: [
              { selector: '#lazy-list', scrollLeft: 0, scrollTop: 255 },
            ],
          },
        },
      ],
    });

    await replay.step();

    expect(order).toEqual([]);
    replay.stop();
  });

  it('does not reapply scroll positions that are already current', async () => {
    document.body.innerHTML = '<button id="already-scrolled">Continue</button>';
    const scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 5,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'same-scroll-click',
          sequence: 1,
          timestamp: 1_000,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#already-scrolled',
            action: 'click',
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          },
        },
      ],
    });

    await replay.step();

    expect(scrollTo).not.toHaveBeenCalled();
    replay.stop();
    scrollTo.mockRestore();
  });

  it('compares named Craft call phases in recorded order', async () => {
    document.body.innerHTML = '<button id="ordered-replay">Run</button>';
    const target = document.querySelector('#ordered-replay')!;
    const observed: Array<Record<string, unknown>> = [];
    target.addEventListener('click', () => {
      observed.push({
        id: 'actual-start',
        sequence: 2,
        timestamp: 1,
        kind: 'craft',
        phase: 'started',
        name: 'saveUser',
        payload: { comparable: true },
      });
      observed.push({
        id: 'actual-end',
        sequence: 3,
        timestamp: 2,
        kind: 'craft',
        phase: 'succeeded',
        name: 'saveUser',
        payload: { comparable: true },
      });
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#ordered-replay', action: 'click' },
        },
        {
          id: 'expected-start',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'craft',
          phase: 'started',
          name: 'saveUser',
          payload: { comparable: true },
        },
        {
          id: 'expected-end',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'craft',
          phase: 'succeeded',
          name: 'saveUser',
          payload: { comparable: true },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      observedEvents: () => observed as never,
    });
    expect(await replay.step()).toBeUndefined();
    expect(observed).toHaveLength(2);
    replay.stop();
  });

  it('reports the first primitive checkpoint mismatch', async () => {
    document.body.innerHTML = '<button id="state-replay">Run</button>';
    const target = document.querySelector('#state-replay')!;
    target.addEventListener('click', () => undefined);
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#state-replay', action: 'click' },
        },
        {
          id: 'checkpoint',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
    });
    expect(await replay.step()).toMatchObject({
      eventId: 'checkpoint',
      expected: { count: 1 },
      actual: { count: 2 },
    });
    replay.stop();
  });

  it('uses a validated scenario checkpoint and its local redaction rule', async () => {
    document.body.innerHTML = '<button id="scenario-replay">Run</button>';
    document
      .querySelector('#scenario-replay')!
      .addEventListener('click', () => undefined);
    const checkpoint = {
      id: 'scenario-checkpoint',
      sequence: 2,
      timestamp: 11,
      kind: 'primitive',
      phase: 'emitted',
      state: { count: 0 },
    } as const;
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'scenario-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#scenario-replay', action: 'click' },
        },
        checkpoint,
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      readState: () => ({ count: 2, requestId: 'runtime-generated' }),
      scenario: {
        format: 'craft-replay-scenario',
        schemaVersion: 1,
        id: 'scenario',
        scenarioVersion: 1,
        reason: 'The identifier is generated for each run.',
        checkpoints: [{ id: 'loaded', path: '/count', expected: 2 }],
        eventAssertions: [],
        visualAssertions: [],
        tolerances: [],
      },
    });

    expect(await replay.step()).toBeUndefined();
    replay.stop();
  });

  it.each([
    {
      name: 'ignores root keys missing from the live registry',
      expected: { count: 1 },
      actual: {},
      diverges: false,
    },
    {
      name: 'ignores newly observed root and nested keys',
      expected: { shared: { value: 1 } },
      actual: { shared: { value: 1, added: true }, 'new-route/query': 'ready' },
      diverges: false,
    },
    {
      name: 'requires expected nested keys to remain present',
      expected: { shared: { value: 1 } },
      actual: { shared: {} },
      diverges: true,
    },
    {
      name: 'keeps array length and order strict',
      expected: { shared: ['first', 'second'] },
      actual: { shared: ['second', 'first'] },
      diverges: true,
    },
  ])('characterizes snapshot comparison: $name', async (scenario) => {
    document.body.innerHTML = '<button id="snapshot-comparison">Run</button>';
    document
      .querySelector('#snapshot-comparison')!
      .addEventListener('click', () => undefined);
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'snapshot-comparison-click',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#snapshot-comparison', action: 'click' },
        },
        {
          id: 'snapshot-comparison-checkpoint',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: scenario.expected,
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      readState: () => scenario.actual,
    });

    const difference = await replay.step();
    expect(Boolean(difference)).toBe(scenario.diverges);
    replay.stop();
  });

  it('restores recorded primitive changes instead of comparing them', async () => {
    document.body.innerHTML = '<button id="state-replay">Run</button>';
    const target = document.querySelector('#state-replay')!;
    target.addEventListener('click', () => undefined);
    const restoreState = vi.fn();
    const readState = vi.fn(() => ({ count: 0 }));
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: { selector: '#state-replay', action: 'click' },
        },
        {
          id: 'state-change',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive' as const,
          phase: 'emitted' as const,
          name: 'primitive-change',
          state: { count: 1 },
        },
      ],
    } satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState,
      restoreState,
    });

    expect(await replay.step()).toBeUndefined();
    expect(restoreState).toHaveBeenCalledWith(
      { count: 1 },
      expect.objectContaining({ id: 'state-change' }),
    );
    expect(readState).not.toHaveBeenCalled();
    replay.stop();
  });

  it('continues when a checkpoint contains primitives from a different route lifecycle', async () => {
    document.body.innerHTML =
      '<button id="route-change">Navigate</button><button id="after-route-change">Continue</button>';
    let continued = false;
    document
      .querySelector('#after-route-change')!
      .addEventListener('click', () => {
        continued = true;
      });
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'route-change-dom',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#route-change', action: 'click' },
        },
        {
          id: 'route-change-checkpoint',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { shared: { value: 1 }, 'old-route/users': [{ id: 3 }] },
        },
        {
          id: 'continue-dom',
          sequence: 3,
          timestamp: 12,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-route-change', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      readState: () => ({ shared: { value: 1 }, 'new-route/query': 'loading' }),
    });

    expect(await replay.step()).toBeUndefined();
    expect(await replay.step()).toBeUndefined();
    expect(continued).toBe(true);
    replay.stop();
  });

  it('forces the recorded href and checkpoint, then continues at the next interaction', async () => {
    document.body.innerHTML =
      '<button id="force-replay">Navigate</button><button id="after-force">Continue</button>';
    let continued = false;
    document.querySelector('#after-force')!.addEventListener('click', () => {
      continued = true;
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom-navigation',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#force-replay',
            action: 'click',
            href: 'http://localhost/expected-route',
          },
        },
        {
          id: 'expected-checkpoint',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive',
          phase: 'emitted',
          state: { route: '/expected-route' },
        },
        {
          id: 'dom-continue',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-force', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const forceRecovery = vi.fn();
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      readState: () => ({ route: '/actual-route' }),
      forceRecovery,
    });

    const difference = await replay.step();
    expect(difference?.recovery).toEqual({
      href: 'http://localhost/expected-route',
      state: { route: '/expected-route' },
    });
    expect(replay.index()).toBe(0);

    await replay.forceAndContinue();
    expect(forceRecovery).toHaveBeenCalledWith({
      href: 'http://localhost/expected-route',
      state: { route: '/expected-route' },
    });
    expect(replay.index()).toBe(1);
    await replay.step();
    expect(continued).toBe(true);
    replay.stop();
  });

  it('offers an explicit checkpoint skip and records the interval', async () => {
    document.body.innerHTML =
      '<button id="skip-replay">Diverge</button><button id="after-skip">Continue</button>';
    document
      .querySelector('#skip-replay')!
      .addEventListener('click', () => undefined);
    let continued = false;
    document.querySelector('#after-skip')!.addEventListener('click', () => {
      continued = true;
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'skip-dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#skip-replay', action: 'click' },
        },
        {
          id: 'mismatch',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
        {
          id: 'resume-checkpoint',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 3 },
        },
        {
          id: 'continue-dom',
          sequence: 4,
          timestamp: 13,
          elapsedMs: 3,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-skip', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const forceRecovery = vi.fn();
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      readState: () => ({ count: 2 }),
      forceRecovery,
    });

    const difference = await replay.step();
    expect(difference?.skip).toEqual({
      checkpointEventId: 'resume-checkpoint',
      index: 1,
    });
    const skipped = await replay.skipToCheckpoint();
    expect(skipped).toEqual({
      from: 1,
      to: 1,
      checkpointEventId: 'resume-checkpoint',
    });
    expect(forceRecovery).toHaveBeenCalledWith({ state: { count: 3 } });
    expect(replay.index()).toBe(1);
    await replay.step();
    expect(continued).toBe(true);
    replay.stop();
  });

  it('does not offer a checkpoint skip across an open operation boundary', async () => {
    document.body.innerHTML = '<button id="blocked-skip">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'blocked-dom',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#blocked-skip', action: 'click' },
        },
        {
          id: 'blocked-difference',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
        {
          id: 'open-http',
          sequence: 3,
          timestamp: 12,
          kind: 'http',
          phase: 'started',
          operationId: 'http-1',
        },
        {
          id: 'blocked-checkpoint',
          sequence: 4,
          timestamp: 13,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 3 },
        },
        {
          id: 'blocked-next-dom',
          sequence: 5,
          timestamp: 14,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#blocked-skip', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
      forceRecovery: vi.fn(),
    });
    const difference = await replay.step();
    expect(difference?.skip).toBeUndefined();
    expect(await replay.skipToCheckpoint()).toBeUndefined();
    replay.stop();
  });

  it.each([
    {
      name: 'when the checkpoint has no registry identity in common',
      checkpoint: { anotherPrimitive: 3 },
      nextInteraction: true,
    },
    {
      name: 'when the checkpoint is the final interaction',
      checkpoint: { count: 3 },
      nextInteraction: false,
    },
    {
      name: 'when no later checkpoint exists',
      checkpoint: undefined,
      nextInteraction: true,
    },
  ])('does not offer a skip $name', async (scenario) => {
    document.body.innerHTML = '<button id="ineligible-skip">Run</button>';
    const events: SendContextReplayExport['events'][number][] = [
      {
        id: 'ineligible-dom',
        sequence: 1,
        timestamp: 10,
        kind: 'dom',
        phase: 'emitted',
        payload: { selector: '#ineligible-skip', action: 'click' },
      },
      {
        id: 'ineligible-difference',
        sequence: 2,
        timestamp: 11,
        kind: 'primitive',
        phase: 'emitted',
        state: { count: 1 },
      },
    ];
    if (scenario.checkpoint) {
      events.push({
        id: 'ineligible-checkpoint',
        sequence: 3,
        timestamp: 12,
        kind: 'snapshot',
        phase: 'emitted',
        state: scenario.checkpoint,
      });
    }
    if (scenario.nextInteraction) {
      events.push({
        id: 'ineligible-next-dom',
        sequence: events.length + 1,
        timestamp: 13,
        kind: 'dom',
        phase: 'emitted',
        payload: { selector: '#ineligible-skip', action: 'click' },
      });
    }
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 5,
        startUrl: 'http://localhost/',
        exportedAt: 14,
        truncated: false,
        clips: [],
        events,
      },
      {
        readState: () => ({ count: 2 }),
        forceRecovery: vi.fn(),
      },
    );

    expect((await replay.step())?.skip).toBeUndefined();
    expect(await replay.skipToCheckpoint()).toBeUndefined();
    replay.stop();
  });

  it('refuses to skip across a started Craft operation without an identity', async () => {
    document.body.innerHTML = '<button id="anonymous-craft">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'anonymous-dom',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#anonymous-craft', action: 'click' },
        },
        {
          id: 'anonymous-difference',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
        {
          id: 'anonymous-start',
          sequence: 3,
          timestamp: 12,
          kind: 'craft',
          phase: 'started',
        },
        {
          id: 'anonymous-checkpoint',
          sequence: 4,
          timestamp: 13,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 3 },
        },
        {
          id: 'anonymous-next-dom',
          sequence: 5,
          timestamp: 14,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#anonymous-craft', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
      forceRecovery: vi.fn(),
    });

    expect((await replay.step())?.skip).toBeUndefined();
    expect(await replay.skipToCheckpoint()).toBeUndefined();
    replay.stop();
  });

  it('uses relative monotonic offsets from v2 for playback timing', async () => {
    document.body.innerHTML = '<button id="relative-replay">Run</button>';
    const target = document.querySelector('#relative-replay')!;
    target.addEventListener('click', () => undefined);
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1000,
      truncated: false,
      clips: [],
      events: [0, 250].map((elapsedMs, index) => ({
        id: `relative-${index}`,
        sequence: index + 1,
        timestamp: 9000 + index,
        elapsedMs,
        kind: 'dom' as const,
        phase: 'emitted' as const,
        payload: { selector: '#relative-replay', action: 'click' },
      })),
    };
    const replay = createReplayController(session);
    await replay.step();
    expect(replay.clock.now()).toBe(0);
    await replay.step();
    expect(replay.clock.now()).toBe(250);
    replay.stop();
  });

  it('plays interactions after their relative delays and can pause', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<button id="timed-replay">Run</button>';
      const target = document.querySelector('#timed-replay')!;
      let clicks = 0;
      target.addEventListener('click', () => clicks++);
      const session = {
        format: 'craft-debug-session' as const,
        version: 5 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [0, 250].map((elapsedMs, index) => ({
          id: `timed-${index}`,
          sequence: index + 1,
          timestamp: 5000 + index,
          elapsedMs,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: { selector: '#timed-replay', action: 'click' },
        })),
      };
      const playbackUpdates: Array<readonly [number, number, string, number?]> =
        [];
      const replay = createReplayController(session, {
        mode: 'legacy-dom',
        onProgress: (index, total, state, nextDelayMs) =>
          playbackUpdates.push([index, total, state, nextDelayMs]),
      });
      replay.play();
      expect(playbackUpdates[0]).toEqual([0, 2, 'playing', 0]);
      await vi.advanceTimersByTimeAsync(0);
      expect(clicks).toBe(1);
      expect(playbackUpdates.at(-1)).toEqual([1, 2, 'playing', 250]);
      await vi.advanceTimersByTimeAsync(249);
      expect(clicks).toBe(1);
      replay.pause();
      await vi.advanceTimersByTimeAsync(1000);
      expect(clicks).toBe(1);
      replay.play();
      await vi.advanceTimersByTimeAsync(249);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(clicks).toBe(2);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not add Craft-event settling time on top of recorded playback delays', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<button id="settled-replay">Run</button>';
      const target = document.querySelector('#settled-replay')!;
      const observed: Array<Record<string, unknown>> = [];
      let clicks = 0;
      target.addEventListener('click', () => {
        clicks += 1;
        if (clicks !== 1) return;
        setTimeout(() => {
          observed.push({
            id: 'actual-start',
            sequence: 2,
            timestamp: 100,
            elapsedMs: 100,
            kind: 'craft',
            phase: 'started',
            name: 'loadData',
          });
        }, 100);
        setTimeout(() => {
          observed.push({
            id: 'actual-end',
            sequence: 3,
            timestamp: 150,
            elapsedMs: 150,
            kind: 'craft',
            phase: 'succeeded',
            name: 'loadData',
          });
        }, 150);
      });
      const session = {
        format: 'craft-debug-session' as const,
        version: 5 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'first-click',
            sequence: 1,
            timestamp: 5000,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#settled-replay', action: 'click' },
          },
          {
            id: 'query-start',
            sequence: 2,
            timestamp: 5100,
            elapsedMs: 100,
            kind: 'craft',
            phase: 'started',
            name: 'loadData',
          },
          {
            id: 'query-end',
            sequence: 3,
            timestamp: 5150,
            elapsedMs: 150,
            kind: 'craft',
            phase: 'succeeded',
            name: 'loadData',
          },
          {
            id: 'second-click',
            sequence: 4,
            timestamp: 5200,
            elapsedMs: 200,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#settled-replay', action: 'click' },
          },
        ],
      } as const satisfies SendContextReplayExport;
      const replay = createReplayController(session, {
        mode: 'legacy-dom',
        observedEvents: () => observed as never,
      });

      replay.play();
      await vi.advanceTimersByTimeAsync(199);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(clicks).toBe(2);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts recorded delays after replay preparation finishes', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML =
        '<button id="prepared-timing-replay">Run</button>';
      const target = document.querySelector('#prepared-timing-replay')!;
      let clicks = 0;
      target.addEventListener('click', () => clicks++);
      const session = {
        format: 'craft-debug-session' as const,
        version: 5 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [0, 250].map((elapsedMs, index) => ({
          id: `prepared-timing-${index}`,
          sequence: index + 1,
          timestamp: 5000 + elapsedMs,
          elapsedMs,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: {
            selector: '#prepared-timing-replay',
            action: 'click',
          },
        })),
      } as const satisfies SendContextReplayExport;
      const replay = createReplayController(session, {
        mode: 'legacy-dom',
        prepare: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      });

      replay.play();
      await vi.advanceTimersByTimeAsync(1000);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(249);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(clicks).toBe(2);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a delayed query result hidden until its recorded completion time', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML =
        '<button id="query-timing-replay">Load</button>';
      const target = document.querySelector('#query-timing-replay')!;
      const observed: Array<Record<string, unknown>> = [];
      let resultVisible = false;
      const replayRef: {
        current?: ReturnType<typeof createReplayController>;
      } = {};
      target.addEventListener('click', () => {
        observed.push({
          id: 'query-start-actual',
          sequence: 1,
          timestamp: 0,
          elapsedMs: 0,
          kind: 'craft',
          phase: 'started',
          name: 'userQuery',
        });
        replayRef.current?.clock.schedule(() => {
          resultVisible = true;
          observed.push({
            id: 'query-success-actual',
            sequence: 2,
            timestamp: 2000,
            elapsedMs: 2000,
            kind: 'craft',
            phase: 'succeeded',
            name: 'userQuery',
          });
        }, 2000);
      });
      const session = {
        format: 'craft-debug-session' as const,
        version: 5 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'query-button-click',
            sequence: 1,
            timestamp: 5000,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#query-timing-replay', action: 'click' },
          },
          {
            id: 'query-start',
            sequence: 2,
            timestamp: 5000,
            elapsedMs: 0,
            kind: 'craft',
            phase: 'started',
            name: 'userQuery',
          },
          {
            id: 'query-success',
            sequence: 3,
            timestamp: 7000,
            elapsedMs: 2000,
            kind: 'craft',
            phase: 'succeeded',
            name: 'userQuery',
          },
        ],
      } as const satisfies SendContextReplayExport;
      const replay = createReplayController(session, {
        mode: 'legacy-dom',
        observedEvents: () => observed as never,
      });
      replayRef.current = replay;

      replay.play();
      await vi.advanceTimersByTimeAsync(1999);
      expect(resultVisible).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resultVisible).toBe(true);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('prepares a start snapshot before dispatching the first interaction', async () => {
    document.body.innerHTML = '<button id="prepared-replay">Run</button>';
    const target = document.querySelector('#prepared-replay')!;
    let restored = false;
    let clickedWithRestoredState = false;
    target.addEventListener('click', () => {
      clickedWithRestoredState = restored;
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 5 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'prepared-dom',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#prepared-replay', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      mode: 'legacy-dom',
      prepare: () => {
        restored = true;
      },
    });
    await replay.step();
    expect(clickedWithRestoredState).toBe(true);
    replay.stop();
  });
});
