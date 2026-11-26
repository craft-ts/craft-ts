import { describe, expectTypeOf, it } from 'vitest';
import {
  craftComputed,
  craftService,
  state,
  type CanRun,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';
import {
  craftComponent,
  div,
  p,
  section,
  type CraftComponent,
  type PropsFromFactory,
} from '../index';

// Follow-up of issue #40. Every case below used to answer `true`: a DI proof
// that compiles while a provider is missing. They now fail closed, with a
// message that says what to change.

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const count = yield* state('count', 0);
    yield* craftComputed('label', function* () {
      return `${yield* count()}`;
    });
  },
);

const Leaf = craftComponent('Leaf', {}, function* () {
  const counter = yield* Counter();
  return p(counter.label);
});

type UnknownContract<Context extends string = 'this component'> = [
  `The dependency contract of a component rendered in ${Context} is unknown: the value is not a component, or a component was typed by hand. Pass the component itself to ComponentDepsOf, and seal a component with sealComponent(Component) instead of typing it`,
];

describe('DI proofs fail closed when the contract is lost', () => {
  it('keeps the proof of a component that was not widened', () => {
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof Leaf>, 'Other'>
    >().toEqualTypeOf<
      ['The Counter service is not provided in this component']
    >();
  });

  it('refuses the contract of a component annotated by hand', () => {
    // The annotation the issue suggested as a workaround: it used to hide the
    // `Counter` requirement and prove the component.
    const Erased: CraftComponent<PropsFromFactory<() => never>> = Leaf;
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof Erased>, 'Other'>
    >().toEqualTypeOf<UnknownContract>();
    // Even with every provider available.
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof Erased>, 'Counter'>
    >().toEqualTypeOf<UnknownContract>();
    type Proof = RouteCheckedDI<ComponentDepsOf<typeof Erased>, 'Counter'>;
    // @ts-expect-error an unknown contract is never a proof.
    type _CannotRun = CanRun<Proof>;
  });

  it('refuses every parent of a widened component', () => {
    const Erased: CraftComponent<PropsFromFactory<() => never>> = Leaf;
    const Parent = craftComponent('Parent', {}, () =>
      div([p('title'), section([Erased()])]),
    );
    const _GrandParent = craftComponent('GrandParent', {}, () =>
      div([Parent()]),
    );
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _GrandParent>, 'Counter'>
    >().toEqualTypeOf<UnknownContract>();
  });

  it('refuses a value that is not a component', () => {
    // `typeof import('./page')` instead of its `default`, for instance.
    const _module = { default: Leaf };
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _module>, 'Other'>
    >().toEqualTypeOf<UnknownContract>();
  });
});
