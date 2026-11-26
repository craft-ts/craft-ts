import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  abstract,
  craftComputed,
  craftException,
  craftService,
  state,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';
import {
  catchNode,
  craftComponent,
  div,
  heading,
  headingSection,
  p,
  section,
  sealComponent,
  withComponentProviders,
  type ComponentInitializationExceptionsOf,
  type Input,
  type PropsOf,
  type SealedComponent,
} from '../index';

// `sealComponent` keeps every contract a parent checks and drops the shape of
// the rendered tree (follow-up of issue #40).

const { Counter, provideCounter } = craftService(
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
const SealedLeaf = sealComponent(Leaf);

type MissingCounter = ['The Counter service is not provided in this component'];

describe('sealComponent', () => {
  it('returns the component itself', () => {
    expect(sealComponent(Leaf)).toBe(Leaf);
  });

  it('keeps the dependency contract', () => {
    expectTypeOf<ComponentDepsOf<typeof SealedLeaf>>().toEqualTypeOf<
      ComponentDepsOf<typeof Leaf>
    >();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof SealedLeaf>, 'Other'>
    >().toEqualTypeOf<MissingCounter>();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof SealedLeaf>, 'Counter'>
    >().toEqualTypeOf<true>();
  });

  it('keeps the contract of every parent rendering a sealed child', () => {
    const _Parent = craftComponent('Parent', {}, () =>
      div([p('title'), section([SealedLeaf()])]),
    );
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _Parent>, 'Other'>
    >().toEqualTypeOf<MissingCounter>();

    const _Provided = craftComponent(
      'Provided',
      { providers: [provideCounter()] },
      () => div([SealedLeaf()]),
    );
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _Provided>, 'Other'>
    >().toEqualTypeOf<true>();
  });

  it('keeps props and required inputs', () => {
    const Titled = craftComponent(
      'Titled',
      {},
      (inputs: { title: Input<string> }) => p(inputs.title),
    );
    const SealedTitled = sealComponent(Titled);
    expectTypeOf<PropsOf<typeof SealedTitled>>().toEqualTypeOf<
      PropsOf<typeof Titled>
    >();
    craftComponent('TitledParentBad', {}, () =>
      // @ts-expect-error the required input is still required.
      div([SealedTitled()]),
    );
  });

  it('keeps initialization exceptions and their exhaustive handling', () => {
    const denied = craftException({ _tag: 'PROFILE_DENIED' });
    const { provideAccess } = craftService(
      { name: 'Access', providedIn: 'abstract' },
      abstract<string | typeof denied>(),
    );
    const Profile = sealComponent(
      craftComponent('Profile', {}, () => p('profile')).pipe(
        withComponentProviders(() => [provideAccess(() => denied)]),
      ),
    );
    expectTypeOf<
      ComponentInitializationExceptionsOf<typeof Profile>
    >().toEqualTypeOf<'PROFILE_DENIED'>();

    craftComponent('ProfileParentBad', {}, () =>
      // @ts-expect-error an uncaught exception still cannot be rendered.
      div([Profile()]),
    );

    const Caught = Profile.pipe(
      catchNode.exhaustive({ PROFILE_DENIED: () => p('denied') }),
    );
    craftComponent('ProfileParent', {}, () => div([Caught()]));
  });

  it('keeps the heading need of its template', () => {
    const Card = sealComponent(
      craftComponent('Card', {}, () => div([heading('Card'), p('body')])),
    );
    craftComponent('CardParent', {}, () => headingSection([Card()]));
    craftComponent(
      'CardParentBad',
      {},
      // @ts-expect-error the parent must still wrap a child heading.
      () => div([Card()]),
    );
  });

  it('can be named in a declaration through SealedComponent', () => {
    const _Named: SealedComponent<typeof Leaf> = SealedLeaf;
    expectTypeOf<ComponentDepsOf<typeof _Named>>().toEqualTypeOf<
      ComponentDepsOf<typeof Leaf>
    >();
  });
});

// A chain of thirty-two sealed components, each rendering the next one inside
// a `div` / `section`, and a node choosing between two of them.
const S32 = sealComponent(
  craftComponent('S32', {}, function* () {
    const counter = yield* Counter();
    return p(counter.label);
  }),
);
const S31 = sealComponent(craftComponent('S31', {}, () => div([p('t'), section([S32()])])));
const S30 = sealComponent(craftComponent('S30', {}, () => div([p('t'), section([S31()])])));
const S29 = sealComponent(craftComponent('S29', {}, () => div([p('t'), section([S30()])])));
const S28 = sealComponent(craftComponent('S28', {}, () => div([p('t'), section([S29()])])));
const S27 = sealComponent(craftComponent('S27', {}, () => div([p('t'), section([S28()])])));
const S26 = sealComponent(craftComponent('S26', {}, () => div([p('t'), section([S27()])])));
const S25 = sealComponent(craftComponent('S25', {}, () => div([p('t'), section([S26()])])));
const S24 = sealComponent(craftComponent('S24', {}, () => div([p('t'), section([S25()])])));
const S23 = sealComponent(craftComponent('S23', {}, () => div([p('t'), section([S24()])])));
const S22 = sealComponent(craftComponent('S22', {}, () => div([p('t'), section([S23()])])));
const S21 = sealComponent(craftComponent('S21', {}, () => div([p('t'), section([S22()])])));
const S20 = sealComponent(craftComponent('S20', {}, () => div([p('t'), section([S21()])])));
const S19 = sealComponent(craftComponent('S19', {}, () => div([p('t'), section([S20()])])));
const S18 = sealComponent(craftComponent('S18', {}, () => div([p('t'), section([S19()])])));
const S17 = sealComponent(craftComponent('S17', {}, () => div([p('t'), section([S18()])])));
const S16 = sealComponent(craftComponent('S16', {}, () => div([p('t'), section([S17()])])));
const S15 = sealComponent(craftComponent('S15', {}, () => div([p('t'), section([S16()])])));
const S14 = sealComponent(craftComponent('S14', {}, () => div([p('t'), section([S15()])])));
const S13 = sealComponent(craftComponent('S13', {}, () => div([p('t'), section([S14()])])));
const S12 = sealComponent(craftComponent('S12', {}, () => div([p('t'), section([S13()])])));
const S11 = sealComponent(craftComponent('S11', {}, () => div([p('t'), section([S12()])])));
const S10 = sealComponent(craftComponent('S10', {}, () => div([p('t'), section([S11()])])));
const S9 = sealComponent(craftComponent('S9', {}, () => div([p('t'), section([S10()])])));
const S8 = sealComponent(craftComponent('S8', {}, () => div([p('t'), section([S9()])])));
const S7 = sealComponent(craftComponent('S7', {}, () => div([p('t'), section([S8()])])));
const S6 = sealComponent(craftComponent('S6', {}, () => div([p('t'), section([S7()])])));
const S5 = sealComponent(craftComponent('S5', {}, () => div([p('t'), section([S6()])])));
const S4 = sealComponent(craftComponent('S4', {}, () => div([p('t'), section([S5()])])));
const S3 = sealComponent(craftComponent('S3', {}, () => div([p('t'), section([S4()])])));
const S2 = sealComponent(craftComponent('S2', {}, () => div([p('t'), section([S3()])])));
const S1 = sealComponent(craftComponent('S1', {}, () => div([p('t'), section([S2()])])));

declare const flag: boolean;
const _Choice = craftComponent('Choice', {}, () =>
  div([flag ? S1() : S2(), flag ? S3() : S16()]),
);

describe('sealed composition at depth', () => {
  it('keeps the proof thirty-two components down', () => {
    expectTypeOf<
      keyof ComponentDepsOf<typeof S1>['missingProvider']
    >().toEqualTypeOf<'Counter'>();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof S1>, 'Other'>
    >().toEqualTypeOf<MissingCounter>();
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof S1>, 'Counter'>
    >().toEqualTypeOf<true>();
  });

  it('compares two deep sealed nodes without overflowing', () => {
    expectTypeOf<
      RouteCheckedDI<ComponentDepsOf<typeof _Choice>, 'Other'>
    >().toEqualTypeOf<MissingCounter>();
  });
});
