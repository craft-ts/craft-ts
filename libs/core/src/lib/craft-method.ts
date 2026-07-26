import {
  assertInInjectionContext,
  inject,
  Injector,
  Provider,
  runInInjectionContext,
} from '@angular/core';
import type {
  BrandedServiceProvider,
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import { ɵcreateHostTaggedInjector } from './craft-service';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import { markYieldableMethod, YIELDABLE_METHOD } from './yieldable';

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

type CraftMethodNameConfig<Name extends string> =
  | Name
  | { name: Name; providers?: readonly Provider[] };

type CraftMethodConfigProviderNames<Config> = Config extends {
  providers: readonly (infer P)[];
}
  ? P extends BrandedServiceProvider<infer N, any, any>
    ? N
    : never
  : never;

type SatisfyDependencies<Deps, SatisfiedNames extends string> = {
  [K in keyof Deps as K extends SatisfiedNames ? never : K]: Deps[K];
};

type TrackedCraftMethod<Callable, Yielded, Config = never> = Callable & {
  readonly [YIELDABLE_METHOD]: {
    readonly yielded?: Yielded;
  };
  readonly [SERVICE_HELPER_DEPENDENCIES]?: [
    CraftMethodConfigProviderNames<Config>,
  ] extends [never]
    ? ServiceDependencyMapFromYielded<Yielded>
    : SatisfyDependencies<
        ServiceDependencyMapFromYielded<Yielded>,
        CraftMethodConfigProviderNames<Config>
      >;
};

function resolveCraftMethodName<Name extends string>(
  nameOrConfig: CraftMethodNameConfig<Name>,
): Name {
  return typeof nameOrConfig === 'string' ? nameOrConfig : nameOrConfig.name;
}

function resolveCraftMethodProviders(
  nameOrConfig: CraftMethodNameConfig<string>,
): readonly Provider[] {
  return typeof nameOrConfig === 'string' ? [] : (nameOrConfig.providers ?? []);
}

export function craftMethod<
  Name extends string,
  This,
  Args extends unknown[],
  Yielded,
  Result,
  Config extends CraftMethodNameConfig<Name> = Name,
>(
  name: Config,
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
): TrackedCraftMethod<
  CraftMethodWithReceiver<This, Args, Result>,
  Yielded,
  Config
>;
export function craftMethod<
  Name extends string,
  This,
  Args extends unknown[],
  Yielded,
  Result,
  Config extends CraftMethodNameConfig<Name> = Name,
>(
  name: Config,
  self: This,
  factory: CraftMethodGenerator<This, Args, Yielded, Result>,
): TrackedCraftMethod<
  CraftMethodWithoutReceiver<Args, Result>,
  Yielded,
  Config
>;
export function craftMethod<This, Args extends unknown[], Yielded, Result>(
  nameOrConfig: CraftMethodNameConfig<string>,
  selfOrFactory: This | CraftMethodGenerator<This, Args, Yielded, Result>,
  maybeFactory?: CraftMethodGenerator<This, Args, Yielded, Result>,
):
  | TrackedCraftMethod<CraftMethodWithReceiver<This, Args, Result>, Yielded>
  | TrackedCraftMethod<CraftMethodWithoutReceiver<Args, Result>, Yielded> {
  assertInInjectionContext(craftMethod);
  const injector = inject(Injector);
  const wrapFn = injectFnWrapper();
  const resolvedName = resolveCraftMethodName(nameOrConfig);
  const extraProviders = resolveCraftMethodProviders(nameOrConfig);

  if (maybeFactory) {
    const self = selfOrFactory as This;
    const factory = wrapFn(maybeFactory);
    const methodInjector = ɵcreateHostTaggedInjector(
      injector,
      `method:${resolvedName}`,
      extraProviders,
    );

    return markYieldableMethod(((...args: Args) =>
      executeCraftMethod(
        factory,
        methodInjector,
        self,
        args,
      )) as TrackedCraftMethod<
      CraftMethodWithoutReceiver<Args, Result>,
      Yielded
    >);
  }

  const factory = wrapFn(
    selfOrFactory as CraftMethodGenerator<This, Args, Yielded, Result>,
  );
  const methodInjector = ɵcreateHostTaggedInjector(
    injector,
    `method:${resolvedName}`,
    extraProviders,
  );

  return markYieldableMethod(function (this: This, ...args: Args) {
    return executeCraftMethod(factory, methodInjector, this, args);
  } as TrackedCraftMethod<
    CraftMethodWithReceiver<This, Args, Result>,
    Yielded
  >);
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
