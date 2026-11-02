/**
 * The mutant plan reads which tests prove what from their fingerprints; the
 * run concludes nothing on a red baseline, tells a mutant no test reached from
 * one every test survived, and reruns nothing the cache already answers.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { BehaviorCatalog } from './behavior-catalog.ts';
import {
  planBehaviorMutants,
  runBehaviorMutants,
  type BehaviorMutantRunner,
} from './behavior-mutants.ts';

const catalog: BehaviorCatalog = {
  version: 1,
  behaviors: [
    { id: 'method:cart.add', kind: 'method' },
    { id: 'method:cart.clear', kind: 'method' },
    { id: 'http-exception:POST /api/orders#OutOfStock', kind: 'http-exception' },
    { id: 'route:shop:cart', kind: 'route' },
  ],
};

const succeeded = (key: string) => ({ key, kind: 'invocation', detail: { outcome: 'succeeded' } });
const failed = (key: string, exception: string) => ({
  key,
  kind: 'invocation',
  detail: { outcome: 'failed', exception },
});

const traces = {
  'src/cart.spec.ts > cart > adds': { steps: [succeeded('invocation:service:cart / method:add')] },
  'src/cart.spec.ts > cart > adds twice': {
    steps: [succeeded('invocation:service:cart / method:add'), succeeded('invocation:service:cart / method:clear')],
    // The clear came after the last assertion: it proves nothing.
    observedSteps: 1,
  },
  'src/order.spec.ts > refuses an empty stock': {
    steps: [failed('invocation:service:checkout / mutation:placeOrder', 'OutOfStock')],
  },
  'src/shop.spec.ts > opens the cart': {
    steps: [{ key: 'route-activation:cart', kind: 'route', detail: { outcome: 'activated' } }],
  },
};

describe('planBehaviorMutants', () => {
  it('breaks each obligation the unit tests prove, through the steps that prove it', () => {
    expect(planBehaviorMutants(catalog, traces)).toEqual([
      {
        obligation: 'http-exception:POST /api/orders#OutOfStock',
        mode: 'succeed',
        keys: ['invocation:service:checkout / mutation:placeOrder'],
        tests: { 'src/order.spec.ts': ['refuses an empty stock'] },
      },
      {
        obligation: 'method:cart.add',
        mode: 'skip',
        keys: ['invocation:service:cart / method:add'],
        tests: { 'src/cart.spec.ts': ['cart > adds', 'cart > adds twice'] },
      },
    ]);
  });

  it('keeps to the obligations it is given', () => {
    expect(
      planBehaviorMutants(catalog, traces, { obligations: new Set(['method:cart.add']) }).map(
        (plan) => plan.obligation,
      ),
    ).toEqual(['method:cart.add']);
  });
});

describe('runBehaviorMutants', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'behavior-mutants-'));
  afterAll(() => rmSync(rootDir, { recursive: true, force: true }));
  mkdirSync(join(rootDir, 'src'));
  writeFileSync(join(rootDir, 'src/cart.ts'), 'export const cart = 1;\n');
  const plans = planBehaviorMutants(catalog, traces);

  const runner = (verdicts: Readonly<Record<string, 'killed' | 'survived' | 'not-reached'>>) => {
    const calls: string[] = [];
    const run: BehaviorMutantRunner = ({ mutant }) => {
      const key = mutant.keys[0] ?? 'baseline';
      calls.push(key);
      // Unmutated, the tests pass; mutated, they fail unless told otherwise.
      const verdict = verdicts[key] ?? (key === 'baseline' ? 'survived' : 'killed');
      return { passed: verdict !== 'killed', applied: verdict !== 'not-reached', output: `ran ${key}` };
    };
    return { run, calls };
  };
  const options = (run: BehaviorMutantRunner) => ({ rootDir, plans, sourceRoots: ['src'], runner: run });

  it('concludes nothing when the tests fail unmutated', () => {
    const { run } = runner({ baseline: 'killed' });
    expect(runBehaviorMutants(options(run))).toEqual({
      baseline: 'red',
      output: 'ran baseline',
      results: [],
    });
  });

  it('tells a mutant no test reached from one the tests survived', () => {
    const { run, calls } = runner({
      'invocation:service:checkout / mutation:placeOrder': 'not-reached',
      'invocation:service:cart / method:add': 'survived',
    });
    expect(runBehaviorMutants(options(run))).toEqual({
      baseline: 'green',
      results: [
        { obligation: 'http-exception:POST /api/orders#OutOfStock', mode: 'succeed', outcome: 'not-reached', cached: false },
        { obligation: 'method:cart.add', mode: 'skip', outcome: 'survived', cached: false },
      ],
    });
    expect(calls).toEqual([
      'baseline',
      'invocation:service:checkout / mutation:placeOrder',
      'invocation:service:cart / method:add',
    ]);
  });

  it('reruns nothing the cache answers, until a source changes', () => {
    const first = runner({});
    expect(runBehaviorMutants(options(first.run)).results.every((result) => result.cached)).toBe(true);
    expect(first.calls).toEqual([]);

    writeFileSync(join(rootDir, 'src/cart.ts'), 'export const cart = 2;\n');
    const second = runner({});
    expect(runBehaviorMutants(options(second.run)).results.map((result) => result.outcome)).toEqual([
      'killed',
      'killed',
    ]);
    expect(second.calls).toHaveLength(3);
  });
});
