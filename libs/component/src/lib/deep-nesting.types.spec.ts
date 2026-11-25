import { describe, expectTypeOf, it } from 'vitest';
import {
  craftComputed,
  craftService,
  state,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';
import { craftComponent, div, p, section } from '../index';

// Issue #40: each component used to carry, as type arguments, the whole tree
// its template returned. A parent re-expanded that tree every time it
// instantiated a type containing a child, one level deeper per nested
// component, until a chain of 7–8 components hit TS2589 and `RouteCheckedDI`
// degraded to `any[]`. The contract is now sealed at each component boundary.

const { Counter, provideCounter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const count = yield* state('count', 0);
    yield* craftComputed('label', function* () {
      return `${yield* count()}`;
    });
  },
);

// The reference case from the issue: the only dependency is in the leaf, every
// other level renders the next one inside a `div` / `section`.
const L8 = craftComponent('L8', {}, function* () {
  const counter = yield* Counter();
  return p(counter.label);
});
const L7 = craftComponent('L7', {}, () => div([p('title'), section([L8()])]));
const L6 = craftComponent('L6', {}, () => div([p('title'), section([L7()])]));
const L5 = craftComponent('L5', {}, () => div([p('title'), section([L6()])]));
const L4 = craftComponent('L4', {}, () => div([p('title'), section([L5()])]));
const L3 = craftComponent('L3', {}, () => div([p('title'), section([L4()])]));
const L2 = craftComponent('L2', {}, () => div([p('title'), section([L3()])]));
const L1 = craftComponent('L1', {}, () => div([p('title'), section([L2()])]));

// Twice as deep, to show the cost no longer grows with the depth of the tree.
const L0 = craftComponent('L0', {}, () => div([p('title'), section([L1()])]));
const M7 = craftComponent('M7', {}, () => div([p('title'), section([L0()])]));
const M6 = craftComponent('M6', {}, () => div([p('title'), section([M7()])]));
const M5 = craftComponent('M5', {}, () => div([p('title'), section([M6()])]));
const M4 = craftComponent('M4', {}, () => div([p('title'), section([M5()])]));
const M3 = craftComponent('M3', {}, () => div([p('title'), section([M4()])]));
const M2 = craftComponent('M2', {}, () => div([p('title'), section([M3()])]));
const _M1 = craftComponent('M1', {}, () => div([p('title'), section([M2()])]));

// A provider in the middle of the tree discharges the leaf's dependency for
// every ancestor above it.
const Provided4 = craftComponent(
  'Provided4',
  { providers: [provideCounter()] },
  () => div([p('title'), section([L5()])]),
);
const Provided3 = craftComponent('Provided3', {}, () =>
  div([p('title'), section([Provided4()])]),
);
const Provided2 = craftComponent('Provided2', {}, () =>
  div([p('title'), section([Provided3()])]),
);
const _Provided1 = craftComponent('Provided1', {}, () =>
  div([p('title'), section([Provided2()])]),
);

type MissingCounter = ['The Counter service is not provided in this component'];

describe('deeply nested component dependency contracts (#40)', () => {
  it('keeps the missing provider of a leaf eight components down', () => {
    expectTypeOf<
      keyof ComponentDepsOf<typeof L1>['missingProvider']
    >().toEqualTypeOf<'Counter'>();

    type CheckL2 = RouteCheckedDI<ComponentDepsOf<typeof L2>, 'Other'>;
    type CheckL1 = RouteCheckedDI<ComponentDepsOf<typeof L1>, 'Other'>;
    expectTypeOf<CheckL2>().toEqualTypeOf<MissingCounter>();
    expectTypeOf<CheckL1>().toEqualTypeOf<MissingCounter>();

    const l1: CheckL1 = [
      'The Counter service is not provided in this component',
    ];
    // @ts-expect-error a missing provider must not be accepted as proven.
    const l1Proof: CheckL1 = true;
    void l1;
    void l1Proof;
  });

  it('proves the tree once the provider is available', () => {
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof L1>, 'Counter'>
    >().toEqualTypeOf<true>();
  });

  it('keeps the proof sixteen components down', () => {
    expectTypeOf<
      keyof ComponentDepsOf<typeof _M1>['missingProvider']
    >().toEqualTypeOf<'Counter'>();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _M1>, 'Other'>
    >().toEqualTypeOf<MissingCounter>();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _M1>, 'Counter'>
    >().toEqualTypeOf<true>();
  });

  it('discharges a dependency provided by an intermediate component', () => {
    expectTypeOf<
      keyof ComponentDepsOf<typeof Provided4>['missingProvider']
    >().toBeNever();
    expectTypeOf<
      keyof ComponentDepsOf<typeof _Provided1>['missingProvider']
    >().toBeNever();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _Provided1>, 'Other'>
    >().toEqualTypeOf<true>();
  });
});
