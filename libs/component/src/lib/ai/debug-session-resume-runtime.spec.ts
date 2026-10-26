import { describe, expect, it, vi } from 'vitest';
import {
  EnvironmentInjector,
  Injector,
  createEnvironmentInjector,
  ɵINJECTOR_SCOPE,
} from '../host-runtime';
import { executeCraftSessionResume } from './debug-session-resume-runtime';

describe('executeCraftSessionResume shared resources', () => {
  it('skips reacquisition when the leader already supplied the resource', async () => {
    const acquire = vi.fn(() => ({ id: 'local-cart' }));
    const entry = {
      address: 'Cart#1 / mutation:create',
      resume: { resource: 'cart', role: 'provides', acquire },
    };
    const resources = new Map([['cart', { id: 'leader-cart' }]]);
    const onResourceAcquired = vi.fn();
    const report = await executeCraftSessionResume({
      plan: {
        format: 'craft-debug-session-resume-plan',
        version: 1,
        targetElapsedMs: 0,
        status: 'ready',
        steps: [
          {
            id: 'acquire-cart',
            kind: 'acquire',
            resource: 'cart',
            primitive: entry.address,
            persona: 'client',
            blocking: true,
          },
        ],
        problems: [],
        expectedCalls: [],
        substitutions: [],
      },
      manifest: {
        format: 'craft-debug-session-resume-manifest',
        version: 1,
        entries: [],
        checklistMarkdown: '',
      },
      snapshot: {
        format: 'craft-debug-app-snapshot',
        version: 1,
        route: '/',
        primitives: {},
        storage: [],
        warnings: [],
      },
      injector: {} as never,
      registry: { list: () => [entry] } as never,
      personas: [],
      preflightAdapter: { readFacts: async () => [] },
      sharedResources: resources,
      onResourceAcquired,
    });

    expect(acquire).not.toHaveBeenCalled();
    expect(onResourceAcquired).not.toHaveBeenCalled();
    expect(report.steps).toEqual([
      expect.objectContaining({
        id: 'acquire-cart',
        status: 'conformant',
        detail: 'Ressource reçue de l’onglet de tête.',
      }),
    ]);
  });
});

/** A root injector: adapters run in an injection context. */
const fakeInjector = createEnvironmentInjector(
  [{ provide: ɵINJECTOR_SCOPE, useValue: 'root' }],
  Injector.NULL as EnvironmentInjector,
  'resume-runtime-spec',
) as never;

const emptyManifest = {
  format: 'craft-debug-session-resume-manifest' as const,
  version: 1 as const,
  entries: [],
  checklistMarkdown: '',
};
const emptySnapshot = {
  format: 'craft-debug-app-snapshot' as const,
  version: 1 as const,
  route: '/',
  primitives: {},
  storage: [],
  warnings: [],
};
const leoIdentity = {
  resource: 'session',
  role: 'client',
  id: 'leo',
  primitive: 'Session#1 / state:currentSession',
  source: 'response' as const,
  elapsedMs: 10,
};

function sessionEntries(acquired: unknown) {
  const acquire = vi.fn((persona: { id?: string }) => ({ ...(acquired as object), persona: persona.id }));
  const write = vi.fn();
  return {
    acquire,
    write,
    entries: [
      {
        address: 'Session#1 / mutation:signIn',
        kind: 'mutation',
        name: 'signIn',
        resume: { resource: 'session', role: 'provides', acquire },
        read: () => undefined,
        write: () => undefined,
      },
      {
        address: 'Session#1 / state:currentSession',
        kind: 'state',
        name: 'currentSession',
        resume: {
          resource: 'session',
          role: 'holds',
          identity: { role: '$.user.role', id: '$.user.id' },
        },
        read: () => undefined,
        write,
      },
    ],
  };
}

function sessionPlan() {
  return {
    format: 'craft-debug-session-resume-plan' as const,
    version: 1 as const,
    targetElapsedMs: 0,
    status: 'ready' as const,
    steps: [
      {
        id: 'acquire',
        kind: 'acquire' as const,
        resource: 'session',
        primitive: 'Session#1 / mutation:signIn',
        persona: 'client',
        personaId: 'leo',
        expectedIdentity: leoIdentity,
        blocking: true,
      },
      {
        id: 'substitute',
        kind: 'substitute' as const,
        resource: 'session',
        primitive: 'Session#1 / state:currentSession',
        dependsOn: ['acquire'],
        blocking: true,
      },
    ],
    problems: [],
    expectedCalls: [],
    substitutions: [],
  };
}

const personas = [
  { role: 'client', id: 'zoe', params: {} },
  { role: 'client', id: 'leo', params: {} },
];

describe('executeCraftSessionResume', () => {
  it('signs in the recorded persona and writes the holder itself', async () => {
    const leo = { token: 'fresh', user: { id: 'leo', role: 'client' } };
    const { acquire, write, entries } = sessionEntries(leo);
    const report = await executeCraftSessionResume({
      plan: sessionPlan(),
      manifest: emptyManifest,
      snapshot: emptySnapshot,
      injector: fakeInjector,
      registry: { list: () => entries } as never,
      personas,
      preflightAdapter: { readFacts: async () => [] },
    });

    expect(acquire).toHaveBeenCalledWith(personas[1]);
    expect(write).toHaveBeenCalledWith({ ...leo, persona: 'leo' });
    expect(report.classification).toBe('real');
  });

  it('blocks an acquisition that comes back as someone else', async () => {
    const camille = { token: 'fresh', user: { id: 'camille', role: 'admin' } };
    const { write, entries } = sessionEntries(camille);
    const report = await executeCraftSessionResume({
      plan: sessionPlan(),
      manifest: emptyManifest,
      snapshot: emptySnapshot,
      injector: fakeInjector,
      registry: { list: () => entries } as never,
      personas,
      preflightAdapter: { readFacts: async () => [] },
    });

    expect(report.classification).toBe('refused');
    expect(report.steps[0], report.steps[0]?.detail).toMatchObject({ status: 'blocked', code: 'identity-mismatch' });
    expect(report.steps[1]).toMatchObject({
      status: 'blocked',
      detail: expect.stringContaining('Non tentée'),
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('does not reload a reader the app already re-read with the new resource', async () => {
    const reload = vi.fn(() => true);
    const entry = {
      address: 'Session#1 / query:currentUser',
      kind: 'query',
      name: 'currentUser',
      resume: { resource: 'session', role: 'requires', calls: ['auth.me'] },
      read: () => ({ user: { id: 'leo' } }),
      write: () => undefined,
      status: () => 'resolved',
      reload,
    };
    const report = await executeCraftSessionResume({
      plan: {
        ...sessionPlan(),
        steps: [
          {
            id: 'refetch',
            kind: 'refetch',
            resource: 'session',
            primitive: entry.address,
            allowedCalls: ['auth.me'],
            blocking: true,
          },
        ],
      },
      manifest: emptyManifest,
      snapshot: emptySnapshot,
      injector: {} as never,
      registry: { list: () => [entry], get: () => entry } as never,
      personas,
      preflightAdapter: { readFacts: async () => [] },
      callsWereReread: (calls) => calls.includes('auth.me'),
    });

    expect(reload).not.toHaveBeenCalled();
    expect(report.classification).toBe('real');
  });
});
