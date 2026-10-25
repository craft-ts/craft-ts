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
      archive: archive(),
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
        'primitive:currentUser': { role: 'requires', resource: 'session' },
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
          id: 'session-response',
          sequence: 2,
          timestamp: 1,
          globalElapsedMs: 5,
          kind: 'http' as const,
          phase: 'succeeded' as const,
          refs: [
            {
              path: '$.token',
              fingerprint: 'aabbccddeeff0011',
              direction: 'in' as const,
            },
          ],
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
        path: '$.token',
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
