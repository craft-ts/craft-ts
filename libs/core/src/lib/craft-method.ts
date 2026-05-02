import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';

type CraftMethodGenerator<This, Args extends unknown[], Result> = (
  this: This,
  ...args: Args
) => Generator<unknown, Result, unknown>;

type CraftMethodWithReceiver<This, Args extends unknown[], Result> = (
  this: This,
  ...args: Args
) => Result;

type CraftMethodWithoutReceiver<Args extends unknown[], Result> = (
  ...args: Args
) => Result;

export function craftMethod<This, Args extends unknown[], Result>(
  factory: CraftMethodGenerator<This, Args, Result>,
): CraftMethodWithReceiver<This, Args, Result>;
export function craftMethod<This, Args extends unknown[], Result>(
  self: This,
  factory: CraftMethodGenerator<This, Args, Result>,
): CraftMethodWithoutReceiver<Args, Result>;
export function craftMethod<This, Args extends unknown[], Result>(
  selfOrFactory: This | CraftMethodGenerator<This, Args, Result>,
  maybeFactory?: CraftMethodGenerator<This, Args, Result>,
):
  | CraftMethodWithReceiver<This, Args, Result>
  | CraftMethodWithoutReceiver<Args, Result> {
  assertInInjectionContext(craftMethod);
  const injector = inject(Injector);

  if (maybeFactory) {
    const self = selfOrFactory as This;
    const factory = maybeFactory;

    return (...args: Args) => executeCraftMethod(factory, injector, self, args);
  }

  const factory = selfOrFactory as CraftMethodGenerator<This, Args, Result>;

  return function (this: This, ...args: Args) {
    return executeCraftMethod(factory, injector, this, args);
  };
}

function executeCraftMethod<This, Args extends unknown[], Result>(
  factory: CraftMethodGenerator<This, Args, Result>,
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
