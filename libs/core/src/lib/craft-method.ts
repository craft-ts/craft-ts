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
import { ɵcreateHostTaggedInjector } from './craft-service';
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

export function craftMethod<
  Name extends string,
  This,
  Args extends unknown[],
  Yielded,
  Result,
>(
  name: Name,
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
): TrackedCraftMethod<CraftMethodWithReceiver<This, Args, Result>, Yielded>;
export function craftMethod<
  Name extends string,
  This,
  Args extends unknown[],
  Yielded,
  Result,
>(
  name: Name,
  self: This,
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
): TrackedCraftMethod<CraftMethodWithoutReceiver<Args, Result>, Yielded>;
export function craftMethod<This, Args extends unknown[], Yielded, Result>(
  name: string,
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
    const methodInjector = ɵcreateHostTaggedInjector(injector, name);

    return ((...args: Args) =>
      executeCraftMethod(
        factory,
        methodInjector,
        self,
        args,
      )) as TrackedCraftMethod<
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
  const methodInjector = ɵcreateHostTaggedInjector(injector, name);

  return function (this: This, ...args: Args) {
    return executeCraftMethod(factory, methodInjector, this, args);
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
