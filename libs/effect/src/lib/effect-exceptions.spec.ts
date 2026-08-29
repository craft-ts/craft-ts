// Finding 0.1-b — does an Effect's error channel reach craft's TYPES?
//
// Before runEffect carried a marker, all of this compiled silently: a route
// could declare no handlers, or wrong ones, for exceptions that provably arrive
// at runtime. These tests are the proof that it no longer does.
import {
  createCraftInjector,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftRoute,
  craftRoutes,
  executeGeneratorCompatibleFactoryAsync,
  assertExhaustiveRouteExceptions,
  type ExtractCraftGenExceptions,
} from '@craft-ts/core';
import { Data, Effect } from 'effect';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import type { EffectExceptionOf } from './effect-exceptions';
import { installCraftEffectBridge, runEffect } from './run-effect';

class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly id: string;
}> {}
class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}

declare const loadUser: Effect.Effect<
  { name: string },
  UserNotFound | Unauthorized
>;

type GuardYielded<G> = G extends () => Generator<infer Y, unknown, unknown>
  ? Y
  : never;

const guard = craftGen(function* () {
  const user = yield* runEffect(loadUser);
  return user.name;
});

describe('0.1-b — E reaches the exception channel at the type level', () => {
  it('advertises both Effect error tags as craft exceptions', () => {
    type Advertised = ExtractCraftGenExceptions<GuardYielded<typeof guard>>;

    expectTypeOf<Advertised>().toEqualTypeOf<
      EffectExceptionOf<UserNotFound | Unauthorized>
    >();
  });

  it('advertises nothing for an infallible Effect', () => {
    const _infallible = craftGen(function* () {
      return yield* runEffect(Effect.succeed(1));
    });
    type Advertised = ExtractCraftGenExceptions<
      GuardYielded<typeof _infallible>
    >;

    expectTypeOf<Advertised>().toEqualTypeOf<never>();
  });

  it('accepts a route whose handlers cover exactly the Effect tags', () => {
    const { probeRoutes } = craftRoutes('probe', [
      craftRoute(
        'probe',
        { canActivate: guard, loadChildren: () => Promise.resolve([]) },
        {
          UserNotFound: craftExceptionHandler(function* ({ globalError }) {
            return globalError();
          }),
          Unauthorized: craftExceptionHandler(function* ({ globalError }) {
            return globalError();
          }),
        },
      ),
    ]);

    assertExhaustiveRouteExceptions(probeRoutes);
    expect(probeRoutes).toBeDefined();
  });

  it('REJECTS a route that forgets one of the Effect tags', () => {
    // Type-only: this is the whole point. Before the fix it compiled.
    const _typeOnly = () => {
      const { probeRoutes } = craftRoutes('probe', [
        craftRoute(
          'probe',
          { canActivate: guard, loadChildren: () => Promise.resolve([]) },
          // The diagnostic lands here, at the route definition, naming the
          // missing handler key. It is reported a second time by the assert
          // below; both directives are load-bearing, and removing either one
          // turns this test red.
          // @ts-expect-error - 'Unauthorized' has no handler.
          {
            UserNotFound: craftExceptionHandler(function* ({ globalError }) {
              return globalError();
            }),
          },
        ),
      ]);
      // The post-inference check still names both the route and the missing
      // tag: { route: "probe"; missingHandlers: "Unauthorized" }.
      // @ts-expect-error - the assert reports the missing Effect tag.
      assertExhaustiveRouteExceptions(probeRoutes);
    };
    expect(typeof _typeOnly).toBe('function');
  });
});

describe('0.1-b — the runtime still agrees with the types', () => {
  let dispose: () => void;
  beforeEach(() => {
    dispose = installCraftEffectBridge();
  });
  afterEach(() => dispose());

  it('still short-circuits with the tag the types promised', async () => {
    const injector = createCraftInjector([]);
    const step = await executeGeneratorCompatibleFactoryAsync({
      factory: function* () {
        return yield* runEffect(Effect.fail(new UserNotFound({ id: 'u-9' })));
        return 'unreachable';
      },
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
    });

    expect(step.kind).toBe('shortCircuit');
    if (step.kind !== 'shortCircuit') throw new Error('expected shortCircuit');
    expect(step.exception._tag).toBe('UserNotFound');
  });

  it('still resumes with the success value', async () => {
    const injector = createCraftInjector([]);
    const step = await executeGeneratorCompatibleFactoryAsync({
      factory: function* () {
        const n = yield* runEffect(Effect.succeed(41));
        return n + 1;
      },
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
    });

    expect(step).toEqual({ kind: 'done', value: 42 });
  });

  // Guard against silently losing the craftException import above.
  void craftException;
});
