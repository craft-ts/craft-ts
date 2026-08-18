// Task 3.1 — fine-grained selection, and the genericity it must not destroy.
import {
  createCraftInjector,
  executeGeneratorCompatibleFactoryAsync,
} from '@craft-ts/core';
import { Context, Data, Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { provideLayer } from './effect-level';
import { effectService } from './effect-service';
import { installCraftEffectBridge } from './run-effect';

class NotFound extends Data.TaggedError('NotFound')<{
  readonly id: string;
}> {}

type UserApiShape = {
  readonly byId: (id: string) => Effect.Effect<{ name: string }, NotFound>;
  readonly count: () => Effect.Effect<number>;
  /** A GENERIC member: the whole point of the test below. */
  readonly first: <T>(items: readonly T[]) => Effect.Effect<T, NotFound>;
};

class UserApi extends Context.Service<UserApi, UserApiShape>()('UserApi') {}

const userApiLayer = Layer.succeed(UserApi)({
  byId: (id: string) =>
    id === 'u-1'
      ? Effect.succeed({ name: 'Ada' })
      : Effect.fail(new NotFound({ id })),
  count: () => Effect.succeed(2),
  first: <T,>(items: readonly T[]) =>
    items.length > 0
      ? Effect.succeed(items[0] as T)
      : Effect.fail(new NotFound({ id: 'empty' })),
});

describe('effectService', () => {
  let dispose: () => void;

  beforeEach(() => {
    dispose = installCraftEffectBridge();
  });
  afterEach(() => dispose());

  const drive = (factory: () => unknown) => {
    const injector = createCraftInjector([provideLayer(userApiLayer)] as never);
    return executeGeneratorCompatibleFactoryAsync({
      factory,
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
    });
  };

  it('resolves the whole service', async () => {
    const step = await drive(function* () {
      const api = yield* effectService(UserApi);
      const user = yield* api.byId('u-1');
      return user.name;
    });

    expect(step).toEqual({ kind: 'done', value: 'Ada' });
  });

  it('resolves only the selected members', async () => {
    const step = await drive(function* () {
      const { byId } = yield* effectService(UserApi, ({ byId }) => ({ byId }));
      const user = yield* byId('u-1');
      return user.name;
    });

    expect(step).toEqual({ kind: 'done', value: 'Ada' });
  });

  it('carries a selected member failure onto the exception channel', async () => {
    const step = await drive(function* () {
      const { byId } = yield* effectService(UserApi, ({ byId }) => ({ byId }));
      yield* byId('nope');
      return 'unreachable';
    });

    expect(step.kind).toBe('shortCircuit');
    if (step.kind !== 'shortCircuit') throw new Error('expected shortCircuit');
    expect(step.exception.code).toBe('NotFound');
  });

  it('KEEPS GENERIC MEMBERS GENERIC through the selection', () => {
    // The regression this file exists for. Wrapping selected members would
    // freeze T at the wrapper's own parameter and collapse every call site.
    const selectFirst = () =>
      effectService(UserApi, ({ first }) => ({ first }));
    // NB: R is UserApi here, not never — the selection keeps its requirement
    // until a provideLayer() satisfies it.
    type Selected =
      ReturnType<typeof selectFirst> extends Effect.Effect<
        infer A,
        infer _E,
        infer _R
      >
        ? A
        : never;

    expectTypeOf<Selected['first']>().toEqualTypeOf<
      <T>(items: readonly T[]) => Effect.Effect<T, NotFound>
    >();
  });

  it('infers the element type at a generic call site', async () => {
    const step = await drive(function* () {
      const { first } = yield* effectService(UserApi, ({ first }) => ({
        first,
      }));
      const picked = yield* first([10, 20, 30]);
      expectTypeOf(picked).toEqualTypeOf<number>();
      return picked;
    });

    expect(step).toEqual({ kind: 'done', value: 10 });
  });
});
