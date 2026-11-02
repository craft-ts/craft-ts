/**
 * Proofs read from normalised session traces, and the ratchet that uses them:
 * a new obligation is proven by a test, one proven on the base stays proven.
 */
import { describe, expect, it } from 'vitest';
import {
  behaviorObligationsReport,
  behaviorRatchet,
  type BehaviorCatalog,
} from './behavior-catalog.ts';
import {
  behaviorProofIndex,
  behaviorProofsFromTrace,
  behaviorStepMatches,
  type BehaviorTraceLike,
} from './behavior-proofs.ts';
import type { DependencyGraph } from './dependency-graph.ts';

const catalog: BehaviorCatalog = {
  version: 1,
  behaviors: [
    { id: 'command:adminView.adminStore#success', kind: 'command' },
    { id: 'http-exception:GET /api/lines#Forbidden', kind: 'http-exception' },
    { id: 'http-exception:GET /api/lines#NotFound', kind: 'http-exception' },
    { id: 'http-exception:POST /api/orders#NotFound', kind: 'http-exception' },
    { id: 'method:cart.empty', kind: 'method' },
    { id: 'mutation:session.signInProcess#success', kind: 'mutation' },
    { id: 'route:ecommerce:admin', kind: 'route' },
    { id: 'route:replay:', kind: 'route' },
    { id: 'route:sessions:', kind: 'route' },
    { id: 'server-function:ecommerce.auth.login', kind: 'server-function' },
  ],
};

const trace = (
  ...steps: [string, string, Record<string, unknown>][]
): BehaviorTraceLike => ({
  steps: steps.map(([kind, key, detail]) => ({ kind, key, detail })),
});

describe('behaviorProofsFromTrace', () => {
  it('reads what ran: invocations, server functions, route activations', () => {
    expect(
      behaviorProofsFromTrace(
        catalog,
        trace(
          // The runtime tags it a query; the graph saw a mutation. Owner and
          // name are what identify it.
          [
            'invocation',
            'invocation:service:session / query:signInProcess',
            { outcome: 'succeeded', behavior: 'session.signInProcess' },
          ],
          [
            'invocation',
            'invocation:component:Shell / route:admin / service:adminView / query:adminStore',
            { outcome: 'succeeded', behavior: 'adminView.adminStore' },
          ],
          ['http', 'server-fn:ecommerce.auth.login', { status: 200, outcome: 'ok' }],
          ['route', 'route-activation:admin', { outcome: 'activated' }],
        ),
      ),
    ).toEqual([
      'command:adminView.adminStore#success',
      'mutation:session.signInProcess#success',
      'route:ecommerce:admin',
      'server-function:ecommerce.auth.login',
    ]);
  });

  it('proves nothing from a failure, a pending call or an unknown step', () => {
    expect(
      behaviorProofsFromTrace(
        catalog,
        trace(
          ['invocation', 'invocation:service:cart / craftMethod:empty', { outcome: 'pending', behavior: 'cart.empty' }],
          ['http', 'server-fn:ecommerce.auth.login', { status: 500, outcome: 'error' }],
          ['route', 'route-activation:admin', { outcome: 'failed' }],
          ['checkpoint', 'checkpoint:service:cart / state:lines', { value: 'x' }],
          ['invocation', 'invocation:service:other / query:missing', { outcome: 'succeeded', behavior: 'other.missing' }],
          // A step without the catalog's name (no owner) proves nothing.
          ['invocation', 'invocation:method:empty', { outcome: 'succeeded' }],
        ),
      ),
    ).toEqual([]);
  });

  it('never guesses between two candidates', () => {
    expect(
      behaviorProofsFromTrace(
        catalog,
        trace(
          // '' is the path of two routes.
          ['route', 'route-activation:', { outcome: 'activated' }],
          // NotFound is thrown by two endpoints.
          ['invocation', 'invocation:service:cart / query:lines', { outcome: 'failed', exception: 'NotFound', behavior: 'cart.lines' }],
          // Forbidden by one only.
          ['invocation', 'invocation:service:cart / query:lines', { outcome: 'failed', exception: 'Forbidden', behavior: 'cart.lines' }],
        ),
      ),
    ).toEqual(['http-exception:GET /api/lines#Forbidden']);
  });

  it('proves nothing from a step no assertion came after', () => {
    expect(
      behaviorProofsFromTrace(catalog, {
        ...trace(
          ['route', 'route-activation:admin', { outcome: 'activated' }],
          ['invocation', 'invocation:service:cart / craftMethod:empty', { outcome: 'succeeded', behavior: 'cart.empty' }],
        ),
        observedSteps: 1,
      }),
    ).toEqual(['route:ecommerce:admin']);
  });

  it('indexes proofs per test, sorted', () => {
    expect(
      behaviorProofIndex(catalog, {
        'shop.b': trace(['route', 'route-activation:admin', { outcome: 'activated' }]),
        'shop.a': trace(),
      }),
    ).toEqual({ 'shop.a': [], 'shop.b': ['route:ecommerce:admin'] });
  });
});

describe('the ratchet with proofs', () => {
  const ids = (...list: string[]): BehaviorCatalog => ({
    version: 1,
    behaviors: list.map((id) => ({ id, kind: 'method' as const })),
  });

  it('accepts a new obligation a test proves, and blocks one that loses its proof', () => {
    const report = behaviorRatchet({
      base: ids('method:a.kept', 'method:a.other'),
      next: ids('method:a.kept', 'method:a.other', 'method:a.new'),
      proven: new Set(['method:a.new', 'method:a.other']),
      baseProven: new Set(['method:a.kept', 'method:a.other']),
    });
    expect(report.unproven).toEqual([]);
    expect(report.lost).toEqual(['method:a.kept']);
  });

  it('lets a waiver keep a proof gone on purpose', () => {
    expect(
      behaviorRatchet({
        base: ids('method:a.kept'),
        next: ids('method:a.kept'),
        baseProven: new Set(['method:a.kept']),
        waivers: [{ rule: 'behavior-unproven', target: 'method:a.kept', reason: 'flow moved to a manual check' }],
      }).lost,
    ).toEqual([]);
  });

  it('reports coverage, lost proofs and tests left with nothing to prove', () => {
    const graph = {
      version: 1,
      rootDir: '/nowhere',
      tsConfigFilePath: '/nowhere/tsconfig.json',
      nodes: [
        {
          id: 'route:shop:cart',
          kind: 'route',
          label: 'shop:cart',
          filePath: '/nowhere/src/app.routes.ts',
          details: { path: 'cart', hasComponent: true },
        },
      ],
      edges: [],
    } as unknown as DependencyGraph;
    const base: BehaviorCatalog = {
      version: 1,
      behaviors: [
        { id: 'route:shop:cart', kind: 'route' },
        { id: 'route:shop:wishlist', kind: 'route' },
      ],
    };
    const report = behaviorObligationsReport(graph, {
      sourceRoots: ['src'],
      base,
      traces: { 'shop.cart': trace(), 'shop.wishlist': trace() },
      baseTraces: {
        'shop.cart': trace(['route', 'route-activation:cart', { outcome: 'activated' }]),
        'shop.wishlist': trace(['route', 'route-activation:wishlist', { outcome: 'activated' }]),
      },
    });
    expect(report.coverage).toEqual({ proven: 0, total: 1 });
    expect(report.violations).toEqual([
      expect.stringContaining("'route:shop:cart' was proven on the base"),
    ]);
    expect(report.warnings).toEqual([
      expect.stringContaining("Test 'shop.wishlist' only proved behaviours that are gone"),
    ]);
  });
});

describe('behaviorStepMatches', () => {
  it('names an obligation the way a proof reads it, and leaves out what is ambiguous', () => {
    expect(Object.fromEntries(behaviorStepMatches(catalog))).toEqual({
      'command:adminView.adminStore#success': { step: 'invocation', outcome: 'succeeded', target: 'adminView.adminStore' },
      // Two endpoints answer NotFound: no step names either alone.
      'http-exception:GET /api/lines#Forbidden': { step: 'invocation', outcome: 'failed', exception: 'Forbidden' },
      'method:cart.empty': { step: 'invocation', outcome: 'succeeded', target: 'cart.empty' },
      'mutation:session.signInProcess#success': { step: 'invocation', outcome: 'succeeded', target: 'session.signInProcess' },
      'route:ecommerce:admin': { step: 'route', path: 'admin' },
      'server-function:ecommerce.auth.login': { step: 'server-fn', id: 'ecommerce.auth.login' },
    });
  });
});
