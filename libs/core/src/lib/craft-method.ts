import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';

type CraftMethodGenerator<This, Args extends unknown[], Yielded, Result> = (
  this: This,
  ...args: Args
) => Generator<Yielded, Result, unknown>;

type CraftMethodWithReceiver<This, Args extends unknown[], Result> = (
  this: This,
  ...args: Args
) => Result;

type CraftMethodWithoutReceiver<Args extends unknown[], Result> = (
  ...args: Args
) => Result;

type TrackedCraftMethod<Callable, Yielded> = Callable & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
};

export function craftMethod<This, Args extends unknown[], Yielded, Result>(
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
): TrackedCraftMethod<CraftMethodWithReceiver<This, Args, Result>, Yielded>;
export function craftMethod<This, Args extends unknown[], Yielded, Result>(
  self: This,
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
): TrackedCraftMethod<CraftMethodWithoutReceiver<Args, Result>, Yielded>;
export function craftMethod<This, Args extends unknown[], Yielded, Result>(
  selfOrFactory: This | CraftMethodGenerator<This, Args, Yielded, Result>,
  maybeFactory?: CraftMethodGenerator<This, Args, Yielded, Result>,
):
  | TrackedCraftMethod<CraftMethodWithReceiver<This, Args, Result>, Yielded>
  | TrackedCraftMethod<CraftMethodWithoutReceiver<Args, Result>, Yielded> {
  assertInInjectionContext(craftMethod);
  const injector = inject(Injector);

  if (maybeFactory) {
    const self = selfOrFactory as This;
    const factory = maybeFactory;

    return ((...args: Args) =>
      executeCraftMethod(factory, injector, self, args)) as TrackedCraftMethod<
      CraftMethodWithoutReceiver<Args, Result>,
      Yielded
    >;
  }

  const factory = selfOrFactory as CraftMethodGenerator<
    This,
    Args,
    Yielded,
    Result
  >;

  return function (this: This, ...args: Args) {
    return executeCraftMethod(factory, injector, this, args);
  } as TrackedCraftMethod<CraftMethodWithReceiver<This, Args, Result>, Yielded>;
}

function executeCraftMethod<This, Args extends unknown[], Yielded, Result>(
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
  injector: Injector,
  self: This,
  args: Args,
): Result {
  return runInInjectionContext(injector, () => {
    const result = factory.apply(self, args);

    if (!isGenerator(result)) {
      return result;
    }

    return runCraftGenerator({
      iterator: result,
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage:
        'craftMethod generators can only yield craftService dependencies or exposed dependency helpers.',
      multipleAppStartErrorMessage:
        'craftMethod generators cannot declare onAppStart(...) more than once.',
      onAppStartNotSupportedErrorMessage:
        'craftMethod(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    }).value as Result;
  });
}
