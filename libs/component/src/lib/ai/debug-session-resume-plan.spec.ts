import { describe, expect, it } from 'vitest';
import type { SendContextReplayExport } from '@craft-ts/core';
import {
  buildDebugSessionResumePlan,
  combineDebugSessionResumePlans,
} from './debug-session-resume-plan';

function archive(): SendContextReplayExport {
  return {
    format: 'craft-debug-session',
    version: 7,
    referenceCaptureVersion: 1,
    startUrl: 'http://localhost/',
    exportedAt: 0,
    truncated: false,
    events: [
      {
        id: 'account-request',
        sequence: 1,
        timestamp: 0,
        globalElapsedMs: 40,
        kind: 'http',
        phase: 'started',
        payload: { source: 'browser-fetch', url: '/account' },
      },
    ],
    clips: [],
  } as SendContextReplayExport;
}

type ArchiveEvent = SendContextReplayExport['events'][number];

/** A full-state primitive event, as captured when a primitive registers or changes. */
function primitiveState(
  sequence: number,
  address: string,
  value: unknown,
  elapsedMs = sequence,
): ArchiveEvent {
  return {
    id: `primitive-${sequence}`,
    sequence,
    timestamp: elapsedMs,
    globalElapsedMs: elapsedMs,
    kind: 'primitive',
    phase: 'emitted',
    name: 'primitive-change',
    payload: { address, primitiveKind: 'state' },
    state: value === undefined ? {} : { [address]: value },
  } as ArchiveEvent;
}

/** A craft server-function call and its recorded answer. */
function serverCall(
  sequence: number,
  id: string,
  status: number,
  body: unknown,
  elapsedMs = sequence,
): ArchiveEvent[] {
  const operationId = `call-${sequence}`;
  return [
    {
      id: `${operationId}-started`,
      sequence,
      timestamp: elapsedMs,
      globalElapsedMs: elapsedMs,
      kind: 'http',
      phase: 'started',
      operationId,
      payload: {
        source: 'browser-fetch',
        url: '/__server-functions',
        body: JSON.stringify({ id, input: {} }),
      },
    },
    {
      id: `${operationId}-answered`,
      sequence: sequence + 1,
      timestamp: elapsedMs + 1,
      globalElapsedMs: elapsedMs + 1,
      kind: 'http',
      phase: 'succeeded',
      operationId,
      // Server functions answer a JSON string: the body is encoded twice.
      response: { status, body: JSON.stringify(JSON.stringify(body)) },
    },
  ] as ArchiveEvent[];
}

function withEvents(...events: ArchiveEvent[]): SendContextReplayExport {
  const recorded = archive();
  return { ...recorded, events: [...recorded.events, ...events] };
}

describe('buildDebugSessionResumePlan', () => {
  it('acquires resources before substituting holders and refetching dependants', () => {
    const addresses = ['state:session', 'mutation:signIn', 'query:currentUser'];
    const plan = buildDebugSessionResumePlan({
      archive: archive(),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: addresses.map((id) => ({ id, kind: 'primitive', label: id })),
        edges: [],
      },
      // Deliberately model registry enumeration order, where the holder is
      // registered before the provider and its dependent query.
      declarations: {
        'state:session': {
          role: 'holds',
          resource: 'session',
          write: () => undefined,
        },
        'mutation:signIn': {
          role: 'provides',
          resource: 'session',
          persona: 'product-manager',
          acquire: () => ({ token: 'fresh', user: { role: 'product-manager' } }),
        },
        'query:currentUser': { role: 'requires', resource: 'session' },
      },
      personas: [
        { role: 'product-manager', id: 'ines', params: { email: 'ines' } },
      ],
    });

    expect(plan.steps.map(({ kind }) => kind)).toEqual([
      'acquire',
      'substitute',
      'refetch',
    ]);
    expect(plan.steps[0]?.primitive).toBe('mutation:signIn');
  });

  it('surfaces a declared future recorded outcome without copying payload data', () => {
    const recorded = archive();
    const session = {
      ...recorded,
      events: [
        ...recorded.events,
        {
          id: 'save-product',
          sequence: 2,
          timestamp: 20,
          globalElapsedMs: 20,
          kind: 'http' as const,
          phase: 'started' as const,
          operationId: 'save-product',
          payload: {
            source: 'browser-fetch',
            url: '/__craft/function',
            body: JSON.stringify({
              id: 'ecommerce.product.save',
              input: { token: 'redacted-token' },
            }),
          },
        },
        {
          id: 'save-product-result',
          sequence: 3,
          timestamp: 21,
          globalElapsedMs: 21,
          kind: 'http' as const,
          phase: 'succeeded' as const,
          operationId: 'save-product',
          response: {
            status: 403,
            body: '{"code":"FORBIDDEN","message":"denied"}',
          },
        },
      ],
    } as SendContextReplayExport;
    const plan = buildDebugSessionResumePlan({
      archive: session,
      targetElapsedMs: 10,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [{ id: 'session', kind: 'primitive', label: 'state:session' }],
        edges: [],
      },
      declarations: {
        session: {
          resource: 'session',
          role: 'holds',
          calls: ['ecommerce.product.save'],
          expect: { outcome: 'recorded' },
          write: () => undefined,
        },
      },
    });

    expect(plan.expectedOutcomes).toEqual([
      {
        call: 'ecommerce.product.save',
        outcome: 'recorded',
        status: 403,
      },
    ]);
    expect(JSON.stringify(plan)).not.toContain('redacted-token');
    expect(JSON.stringify(plan)).not.toContain('denied');
  });

  it('refuses a provider with a missing persona and reports calls up to the target', () => {
    const plan = buildDebugSessionResumePlan({
      archive: archive(),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': {
          role: 'provides',
          resource: 'session',
          persona: 'product-manager',
        },
      },
      personas: [],
    });

    expect(plan.status).toBe('refused');
    expect(plan.problems.map((problem) => problem.code)).toContain(
      'persona-missing',
    );
    expect(plan.expectedCalls).toEqual(['browser-fetch /account']);
  });

  it('refuses a provider that has no persona declaration', () => {
    const plan = buildDebugSessionResumePlan({
      archive: archive(),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': { role: 'provides', resource: 'session' },
      },
      personas: [],
    });
    expect(plan.status).toBe('refused');
    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: 'persona-missing', blocking: true }),
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: 'acquire', blocking: true }),
    );
  });

  it('refuses to mark a provider ready without a local reacquisition adapter', () => {
    const plan = buildDebugSessionResumePlan({
      archive: archive(),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': {
          role: 'provides',
          resource: 'session',
          persona: 'product-manager',
        },
      },
      personas: [{ role: 'product-manager', id: 'ines', params: {} }],
    });

    expect(plan.status).toBe('refused');
    expect(plan.problems).toContainEqual(
      expect.objectContaining({
        code: 'acquire-adapter-missing',
        blocking: true,
      }),
    );
  });

  it('refuses a held resource with no substitution adapter', () => {
    const plan = buildDebugSessionResumePlan({
      archive: withEvents(primitiveState(2, 'primitive:session', { token: 't' })),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': {
          role: 'holds',
          resource: 'session',
          path: '$.token',
        },
      },
    });
    expect(plan.status).toBe('refused');
    expect(plan.problems).toContainEqual(
      expect.objectContaining({
        code: 'resource-without-substitution',
        blocking: true,
      }),
    );
  });

  it('plans restoration for a server-owned resource payload', () => {
    const plan = buildDebugSessionResumePlan({
      archive: archive(),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          { id: 'primitive:cartLines', kind: 'primitive', label: 'cart lines' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:cartLines': {
          role: 'restores',
          resource: 'cart',
          path: '$.lines',
          write: () => undefined,
        },
      },
    });
    expect(plan.steps).toContainEqual(
      expect.objectContaining({
        kind: 'restore',
        resource: 'cart',
        blocking: false,
      }),
    );
  });

  it('refuses a required resource with no provider or holder', () => {
    const plan = buildDebugSessionResumePlan({
      archive: withEvents(...serverCall(2, 'auth.me', 200, { user: {} })),
      targetElapsedMs: 50,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          {
            id: 'primitive:currentUser',
            kind: 'primitive',
            label: 'current user',
          },
        ],
        edges: [],
      },
      declarations: {
        'primitive:currentUser': {
          role: 'requires',
          resource: 'session',
          calls: ['auth.me'],
        },
      },
    });
    expect(plan.status).toBe('refused');
    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: 'resource-without-provider' }),
    );
  });

  it('rejects archives without reference provenance and source drift', () => {
    const legacy = { ...archive(), referenceCaptureVersion: undefined };
    const plan = buildDebugSessionResumePlan({
      archive: legacy,
      targetElapsedMs: 0,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: { 'primitive:session': 'old' },
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': {
          role: 'holds',
          resource: 'session',
          write: () => undefined,
        },
      },
      sourceHashes: { 'primitive:session': 'new' },
    });

    expect(plan.status).toBe('refused');
    expect(plan.problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining(['archive-without-provenance', 'source-drift']),
    );
  });

  it('warns without refusing when the archive has no source hash baseline', () => {
    const plan = buildDebugSessionResumePlan({
      archive: archive(),
      targetElapsedMs: 0,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: { 'primitive:session': 'current' },
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': {
          role: 'holds',
          resource: 'session',
          write: () => undefined,
        },
      },
    });

    expect(plan.problems).toContainEqual(
      expect.objectContaining({
        code: 'source-hashes-unavailable',
        blocking: false,
      }),
    );
    expect(plan.status).toBe('ready');
  });

  it('keeps substitutions fingerprint-only and binds them to the declared path', () => {
    const recorded = archive();
    const session = {
      ...recorded,
      events: [
        {
          id: 'session-storage',
          sequence: 2,
          timestamp: 1,
          globalElapsedMs: 5,
          kind: 'storage' as const,
          phase: 'emitted' as const,
          name: 'browser-storage-initial',
          refs: [
            {
              path: 'storage.localStorage[0][1].queryValue.token',
              fingerprint: 'aabbccddeeff0011',
              direction: 'in' as const,
            },
            {
              path: 'storage.sessionStorage[0][1]',
              fingerprint: '1100ffeeddccbbaa',
              direction: 'in' as const,
            },
          ],
        },
        primitiveState(3, 'primitive:session', { token: 'craft-ref:aabbccddeeff0011' }, 6),
      ],
    } as SendContextReplayExport;
    const plan = buildDebugSessionResumePlan({
      archive: session,
      targetElapsedMs: 10,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [
          { id: 'primitive:session', kind: 'primitive', label: 'session' },
        ],
        edges: [],
      },
      declarations: {
        'primitive:session': {
          role: 'holds',
          resource: 'session',
          path: '$.token',
          write: () => undefined,
        },
      },
    });

    expect(plan.substitutions).toEqual([
      {
        resource: 'session',
        fingerprint: 'aabbccddeeff0011',
        placeholder: 'craft-ref:aabbccddeeff0011',
        path: 'storage.localStorage[0][1].queryValue.token',
        valuePath: '$.token',
      },
    ]);
  });

  it('rearms checkpointed temporal tasks using their remaining delay', () => {
    const recorded = archive();
    const session = {
      ...recorded,
      events: [
        {
          id: 'checkpoint',
          sequence: 1,
          timestamp: 0,
          globalElapsedMs: 5,
          kind: 'snapshot' as const,
          phase: 'emitted' as const,
          name: 'replay-checkpoint',
          payload: {
            format: 'craft-debug-replay-snapshot',
            version: 1,
            appVersion: '1',
            capturedAt: 0,
            route: { url: '/' },
            primitives: {},
            storage: [],
            temporalNow: 100,
            pendingTasks: [
              { kind: 'debounce', owner: 'primitive:search', dueAt: 240 },
            ],
            capabilities: {
              primitives: true,
              storage: true,
              inFlightOperations: false,
            },
          },
        },
      ],
    } as SendContextReplayExport;
    const plan = buildDebugSessionResumePlan({
      archive: session,
      targetElapsedMs: 10,
      graph: {
        format: 'craft-resume-graph',
        version: 1,
        sourceHashes: {},
        nodes: [],
        edges: [],
      },
      declarations: {},
    });

    expect(plan.steps).toContainEqual(
      expect.objectContaining({
        kind: 'rearm-task',
        primitive: 'primitive:search',
        delayMs: 140,
        blocking: false,
      }),
    );
  });
});

const SESSION = 'service:session / state:currentSession#1';
const SIGN_IN = 'service:session / mutation:signInProcess#1';
const CURRENT_USER = 'service:session / query:currentUser#1';
const SIGN_OUT = 'service:session / query:signOutProcess#1';

function sessionPlan(
  events: readonly ArchiveEvent[],
  targetElapsedMs = 100,
  extra: Partial<Parameters<typeof buildDebugSessionResumePlan>[0]> = {},
) {
  const declarations = {
    [SESSION]: {
      role: 'holds' as const,
      resource: 'session',
      path: '$.token',
      identity: { role: '$.user.role', id: '$.user.id', storageKey: 'session.v1' },
      write: () => undefined,
    },
    [SIGN_IN]: {
      role: 'provides' as const,
      resource: 'session',
      calls: ['ecommerce.auth.login', 'ecommerce.auth.me'],
      acquire: () => undefined,
    },
    [CURRENT_USER]: {
      role: 'requires' as const,
      resource: 'session',
      calls: ['ecommerce.auth.me'],
      identity: { role: '$.user.role', id: '$.user.id' },
    },
    [SIGN_OUT]: { role: 'revokes' as const, resource: 'session' },
  };
  return buildDebugSessionResumePlan({
    archive: withEvents(...events),
    targetElapsedMs,
    graph: {
      format: 'craft-resume-graph',
      version: 1,
      sourceHashes: {},
      nodes: Object.keys(declarations).map((id) => ({
        id,
        kind: 'primitive',
        label: id,
      })),
      edges: [],
    },
    declarations,
    personas: [
      { role: 'admin', id: 'camille', params: {} },
      { role: 'product-manager', id: 'ines', params: {} },
      { role: 'client', id: 'leo', params: {} },
    ],
    ...extra,
  });
}

const leo = { token: 't-leo', user: { id: 'leo', role: 'client' } };
const camille = { token: 't-camille', user: { id: 'camille', role: 'admin' } };
const acquisitionOf = (plan: ReturnType<typeof sessionPlan>) =>
  plan.steps.find((step) => step.kind === 'acquire');

describe('recorded identity', () => {
  it('reconnects with the persona of the recorded auth.me answer', () => {
    const plan = sessionPlan([
      primitiveState(2, SESSION, leo),
      ...serverCall(3, 'ecommerce.auth.me', 200, leo),
    ]);

    expect(plan.status).toBe('ready');
    expect(acquisitionOf(plan)).toMatchObject({
      persona: 'client',
      personaId: 'leo',
      expectedIdentity: {
        role: 'client',
        id: 'leo',
        source: 'response',
        primitive: CURRENT_USER,
      },
      reason: expect.stringContaining('Connexion en tant que leo (client)'),
    });
    expect(
      plan.steps.find((step) => step.kind === 'refetch')?.expectedIdentity,
    ).toMatchObject({ role: 'client', id: 'leo' });
  });

  it('reads the identity from the restored state when no answer was recorded', () => {
    const plan = sessionPlan([primitiveState(2, SESSION, leo)]);
    expect(acquisitionOf(plan)).toMatchObject({
      personaId: 'leo',
      expectedIdentity: { source: 'state', primitive: SESSION },
    });
  });

  it('reads the identity from the restored storage of a persisted holder', () => {
    const plan = sessionPlan([
      {
        id: 'storage',
        sequence: 2,
        timestamp: 2,
        globalElapsedMs: 2,
        kind: 'storage',
        phase: 'emitted',
        name: 'restored',
        payload: { storeName: 'atelier', key: 'session.v1', value: camille },
      } as ArchiveEvent,
    ]);
    expect(acquisitionOf(plan)).toMatchObject({
      persona: 'admin',
      personaId: 'camille',
      expectedIdentity: { source: 'storage' },
    });
  });

  it('keeps the last identity before the target when the session changed hands', () => {
    const events = [
      primitiveState(2, SESSION, leo, 2),
      ...serverCall(3, 'ecommerce.auth.me', 200, leo, 3),
      primitiveState(10, SESSION, camille, 10),
      ...serverCall(11, 'ecommerce.auth.me', 200, camille, 11),
    ];
    expect(acquisitionOf(sessionPlan(events, 5))?.personaId).toBe('leo');
    expect(acquisitionOf(sessionPlan(events, 50))?.personaId).toBe('camille');
  });

  it('refuses a recorded role that no persona can play', () => {
    const auditor = { token: 't', user: { id: 'zoe', role: 'auditor' } };
    const plan = sessionPlan([
      primitiveState(2, SESSION, auditor),
      ...serverCall(3, 'ecommerce.auth.me', 200, auditor),
    ]);
    expect(plan.status).toBe('refused');
    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: 'persona-missing', blocking: true }),
    );
  });

  it('refuses a live session whose identity was never recorded', () => {
    const plan = sessionPlan([primitiveState(2, SESSION, { token: 't' })]);
    expect(plan.status).toBe('refused');
    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: 'identity-unknown', blocking: true }),
    );
  });

  it('marks an explicitly assisted persona instead of falling back silently', () => {
    const plan = sessionPlan(
      [primitiveState(2, SESSION, leo), ...serverCall(3, 'ecommerce.auth.me', 200, leo)],
      100,
      { assistedPersonas: { session: 'admin' } },
    );
    expect(acquisitionOf(plan)).toMatchObject({
      persona: 'admin',
      personaId: 'camille',
      assisted: true,
      expectedIdentity: { role: 'admin', id: 'camille' },
    });
  });
});

describe('resource liveness', () => {
  it('skips a resource revoked before the target', () => {
    const plan = sessionPlan([
      primitiveState(2, SESSION, leo),
      ...serverCall(3, 'ecommerce.auth.me', 200, leo),
      {
        id: 'sign-out',
        sequence: 6,
        timestamp: 6,
        globalElapsedMs: 6,
        kind: 'craft',
        phase: 'started',
        name: 'query:signOutProcess',
      } as ArchiveEvent,
    ]);

    expect(plan.status).toBe('ready');
    const sessionSteps = plan.steps.filter((step) => step.resource === 'session');
    expect(sessionSteps.length).toBeGreaterThan(0);
    for (const step of sessionSteps)
      expect(step).toMatchObject({
        unneeded: true,
        blocking: false,
        reason: expect.stringContaining('Non nécessaire'),
      });
  });

  it('skips a resource whose holder is empty and whose last answer failed', () => {
    const plan = sessionPlan([
      primitiveState(2, SESSION, leo),
      primitiveState(4, SESSION, undefined),
      ...serverCall(5, 'ecommerce.auth.me', 401, { code: 'AUTH_REQUIRED' }),
    ]);
    expect(acquisitionOf(plan)?.unneeded).toBe(true);
  });

  it('keeps a resource alive while a holder still has its value', () => {
    const plan = sessionPlan([primitiveState(2, SESSION, leo)]);
    expect(acquisitionOf(plan)?.unneeded).toBeUndefined();
  });

  it('chains substitutions and refetches on their acquisition', () => {
    const plan = sessionPlan([primitiveState(2, SESSION, leo)]);
    const acquire = acquisitionOf(plan)!;
    expect(plan.steps.find((step) => step.kind === 'substitute')?.dependsOn).toEqual([
      acquire.id,
    ]);
    expect(plan.steps.find((step) => step.kind === 'refetch')?.dependsOn).toEqual([
      acquire.id,
      `substitute:${SESSION}:session`,
    ]);
  });
});

describe('combineDebugSessionResumePlans', () => {
  it('keeps each tab identity and refuses the aggregate when a tab is blocked', () => {
    const base = {
      format: 'craft-debug-session-resume-plan' as const,
      version: 1 as const,
      targetElapsedMs: 120,
      steps: [
        {
          id: 'acquire-cart',
          kind: 'acquire' as const,
          resource: 'cart',
          blocking: true,
        },
      ],
      expectedCalls: ['ecommerce.cart.create'],
      substitutions: [],
    };
    const combined = combineDebugSessionResumePlans({
      participantIds: ['buyer', 'admin'],
      targetElapsedMs: 120,
      clockPolicy: 'real',
      plans: [
        {
          participantId: 'buyer',
          plan: { ...base, status: 'ready', problems: [] },
        },
        {
          participantId: 'admin',
          plan: {
            ...base,
            status: 'refused',
            problems: [
              {
                code: 'missing-persona',
                message: 'Persona absente.',
                blocking: true,
              },
            ],
          },
        },
      ],
    });

    expect(combined.status).toBe('refused');
    expect(combined.participantIds).toEqual(['buyer', 'admin']);
    expect(
      combined.steps.map(({ id, participantId }) => [id, participantId]),
    ).toEqual([
      ['buyer:acquire-cart', 'buyer'],
      ['admin:acquire-cart', 'admin'],
    ]);
    expect(combined.expectedCalls).toEqual(['ecommerce.cart.create']);
    expect(combined.problems[0]?.message).toBe('admin · Persona absente.');
  });
});
