import { Injector, InjectionToken, type Provider } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ConcreteServiceScope } from './craft-service.shared';
import { injectFnWrapper } from './fn-wrapper';
import {
  isTemporalAwaitRequest,
  type RuntimeTemporalAwaitRequest,
} from './temporal-runtime';
import {
  isReactiveReadRequest,
  REACTIVE_READ_OBSERVERS,
  ɵwithActiveReactiveReader,
  type ReactiveReadIdentity,
} from './reactive-read';
import { ɵcraftInjectorFromHost } from './host/craft-injector';

export const SERVICE_YIELD_REQUEST_MARKER = Symbol(
  'service-yield-request-marker',
);
export const SERVICE_DEPENDENCY_ACCESS_MARKER = Symbol(
  'service-dependency-access-marker',
);
export const SERVICE_APP_START_REQUEST_MARKER = Symbol(
  'service-app-start-request-marker',
);
export const SERVICE_TRACKED_DEPS_REQUEST_MARKER = Symbol(
  'service-tracked-deps-request-marker',
);
export const GUARD_AWAIT_REQUEST_MARKER = Symbol('guard-await-request-marker');

export type ServiceYieldContext = Readonly<{
  name: string;
  scope: ConcreteServiceScope;
  hostScope: ConcreteServiceScope;
  injector: Injector;
  resolve(): unknown;
}>;

export type ServiceYieldWrapper = (
  context: ServiceYieldContext,
  next: () => Generator<unknown, unknown, unknown>,
) => Generator<unknown, unknown, unknown>;

export const SERVICE_YIELD_WRAPPER = new InjectionToken<
  readonly ServiceYieldWrapper[]
>('SERVICE_YIELD_WRAPPER', {
  providedIn: 'root',
  factory: () => [],
});

/** Registers a wrapper around every Craft service yield below the provider. */
export function provideServiceYieldWrapper(
  _warning: string,
  wrapper: ServiceYieldWrapper,
): Provider {
  return { provide: SERVICE_YIELD_WRAPPER, useValue: wrapper, multi: true };
}

type AppStartResult = Observable<unknown> | Promise<unknown> | void;

type AnyGeneratorFunction = (
  ...args: never[]
) => Generator<unknown, unknown, unknown>;

export type ResolveGeneratorResult<Result> =
  Result extends Generator<any, infer Output, unknown> ? Output : Result;

export type ExtractFactoryYielded<Factory> = Factory extends (
  ...args: any[]
) => Generator<infer Yielded, any, unknown>
  ? Yielded
  : never;

export type GeneratorCompatibleFactory<
  Factory,
  Yielded = never,
> = Factory extends (...args: infer Args) => infer Result
  ? (
      ...args: Args
    ) => Result | Generator<Yielded, Result | Awaited<Result>, unknown>
  : never;

type RuntimeServiceYieldRequest<Result = unknown> = Readonly<{
  [SERVICE_YIELD_REQUEST_MARKER]: true;
  name: string;
  scope: ConcreteServiceScope;
  resolve: (injector: Injector, hostScope: ConcreteServiceScope) => Result;
}>;

type RuntimeServiceDependencyAccessRequest = Readonly<{
  [SERVICE_DEPENDENCY_ACCESS_MARKER]: true;
  key: string;
  resolve: () => unknown;
}>;

type RuntimeServiceAppStartRequest = Readonly<{
  [SERVICE_APP_START_REQUEST_MARKER]: true;
  run: () => AppStartResult;
}>;

type RuntimeServiceTrackedDepsRequest = Readonly<{
  [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true;
}>;

/**
 * Minimal runtime view of a craft resource the guard driver needs to decide
 * whether it has *settled* (`status` is `'resolved'` or `'error'`) and to read
 * the outcome. Mirrors the public resource signals as plain getters so the
 * driver does not depend on the full query/mutation types.
 */
export type GuardAwaitResourceLike = {
  status: () => string;
  value: () => unknown;
  error: () => unknown;
  hasException: () => boolean;
  exceptions: () => { list: readonly unknown[] };
};

/**
 * The request a guard generator yields (via `craftUntilSettled` / `craftUntilDefined`) to
 * suspend until an async craft operation completes. It is **never** handled by
 * the synchronous {@link runCraftGenerator}; only the two-phase route chain
 * driver (`runCraftRouteChainAsync`) understands it. Discriminated by `kind`:
 *
 * - `'settle'` — wait for a craft resource signal to reach a settled status.
 * - `'promise'` — wait for a thenable (e.g. a `CraftHttpClient` request
 *   descriptor) to resolve, then resume with its value.
 */
export type RuntimeGuardAwaitRequest =
  | Readonly<{
      [GUARD_AWAIT_REQUEST_MARKER]: true;
      kind: 'settle';
      resource: GuardAwaitResourceLike;
    }>
  | Readonly<{
      [GUARD_AWAIT_REQUEST_MARKER]: true;
      kind: 'promise';
      value: PromiseLike<unknown>;
    }>;

export type RuntimeAwaitRequest =
  | RuntimeGuardAwaitRequest
  | RuntimeTemporalAwaitRequest;

export function isGuardAwaitRequest(
  value: unknown,
): value is RuntimeGuardAwaitRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    GUARD_AWAIT_REQUEST_MARKER in value
  );
}

type RunCraftGeneratorOptions = {
  iterator: Generator<unknown, unknown, unknown>;
  injector: Injector;
  hostScope: ConcreteServiceScope;
  invalidYieldErrorMessage: string;
  multipleAppStartErrorMessage: string;
  createAppStartHook?: (
    run: RuntimeServiceAppStartRequest['run'],
  ) => () => AppStartResult;
  onAppStartNotSupportedErrorMessage?: string;
  guardAwaitNotSupportedErrorMessage?: string;
  /** Identity of the computation currently consuming reactive values. */
  reactiveReader?: ReactiveReadIdentity;
};

export function runCraftGenerator({
  iterator,
  injector,
  hostScope,
  invalidYieldErrorMessage,
  multipleAppStartErrorMessage,
  createAppStartHook,
  onAppStartNotSupportedErrorMessage,
  guardAwaitNotSupportedErrorMessage,
  reactiveReader,
}: RunCraftGeneratorOptions): {
  value: unknown;
  appStartHook?: () => AppStartResult;
} {
  let appStartHook: (() => AppStartResult) | undefined;
  let current = iterator.next();

  while (!current.done) {
    const yielded = current.value;

    if (isReactiveReadRequest(yielded)) {
      for (const observer of injector.get(REACTIVE_READ_OBSERVERS, [])) {
        observer({ reader: reactiveReader, dependency: yielded.identity });
      }
      current = iterator.next(
        ɵwithActiveReactiveReader(yielded.identity, yielded.read),
      );
      continue;
    }

    if (isServiceYieldRequest(yielded)) {
      current = iterator.next(
        resolveServiceYield(yielded, injector, hostScope),
      );
      continue;
    }

    if (isServiceDependencyAccessRequest(yielded)) {
      current = iterator.next(yielded.resolve());
      continue;
    }

    if (isServiceTrackedDepsRequest(yielded)) {
      // Type-level only: the tracked primitive resolves its own dependencies
      // lazily through the injector. Nothing to do at runtime.
      current = iterator.next(undefined);
      continue;
    }

    if (isServiceAppStartRequest(yielded)) {
      if (onAppStartNotSupportedErrorMessage) {
        throw new Error(onAppStartNotSupportedErrorMessage);
      }

      if (appStartHook) {
        throw new Error(multipleAppStartErrorMessage);
      }

      appStartHook = createAppStartHook
        ? createAppStartHook(yielded.run)
        : yielded.run;
      current = iterator.next(undefined);
      continue;
    }

    if (isTemporalAwaitRequest(yielded)) {
      throw new Error(
        'This Craft generator requires the async driver because it yields craftSleep(...).',
      );
    }

    if (guardAwaitNotSupportedErrorMessage && isGuardAwaitRequest(yielded)) {
      throw new Error(guardAwaitNotSupportedErrorMessage);
    }

    throw new Error(invalidYieldErrorMessage);
  }

  return {
    value: current.value,
    appStartHook,
  };
}

export function isGenerator(
  value: unknown,
): value is Generator<unknown, unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'next' in value &&
    typeof value.next === 'function'
  );
}

export function isGeneratorFunction(
  value: unknown,
): value is AnyGeneratorFunction {
  return (
    typeof value === 'function' &&
    (value.constructor?.name === 'GeneratorFunction' ||
      Object.prototype.toString.call(value) === '[object GeneratorFunction]')
  );
}

export function executeGeneratorCompatibleFactory<
  This,
  Args extends unknown[],
  Result,
>({
  factory,
  thisArg,
  getInjector,
  args,
  invalidYieldErrorMessage,
  multipleAppStartErrorMessage,
  onAppStartNotSupportedErrorMessage,
}: {
  factory: (this: This, ...args: Args) => Result;
  thisArg: This;
  getInjector: () => Injector;
  args: Args;
  invalidYieldErrorMessage: string;
  multipleAppStartErrorMessage: string;
  onAppStartNotSupportedErrorMessage?: string;
}): ResolveGeneratorResult<Result> {
  const injector = getInjector();
  const craftInjector = ɵcraftInjectorFromHost(injector);
  const wrappedFactory = craftInjector.run(() => injectFnWrapper()(factory));
  const result = wrappedFactory.apply(thisArg, args);

  if (!isGenerator(result)) {
    return result as ResolveGeneratorResult<Result>;
  }

  return craftInjector.run(() => {
    return runCraftGenerator({
      iterator: result,
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage,
      multipleAppStartErrorMessage,
      onAppStartNotSupportedErrorMessage,
    }).value as ResolveGeneratorResult<Result>;
  });
}

/**
 * Resolves a single non-await craft generator yield (service request, dependency
 * access, or tracked-deps marker) exactly as {@link runCraftGenerator}'s loop
 * does. Returns `{ handled: false }` for anything it does not recognise (e.g. a
 * guard await-request or an app-start request) so the caller can decide how to
 * proceed. Shared with the guard driver, which must resolve these yields itself
 * while intercepting guard await-requests.
 */
export function resolveCraftGeneratorYield(
  yielded: unknown,
  injector: Injector,
  hostScope: ConcreteServiceScope,
): { handled: true; value: unknown } | { handled: false } {
  if (isReactiveReadRequest(yielded)) {
    for (const observer of injector.get(REACTIVE_READ_OBSERVERS, [])) {
      observer({ dependency: yielded.identity });
    }
    return {
      handled: true,
      value: ɵwithActiveReactiveReader(yielded.identity, yielded.read),
    };
  }

  if (isServiceYieldRequest(yielded)) {
    return {
      handled: true,
      value: resolveServiceYield(yielded, injector, hostScope),
    };
  }

  if (isServiceDependencyAccessRequest(yielded)) {
    return { handled: true, value: yielded.resolve() };
  }

  if (isServiceTrackedDepsRequest(yielded)) {
    return { handled: true, value: undefined };
  }

  return { handled: false };
}

function resolveServiceYield(
  request: RuntimeServiceYieldRequest,
  injector: Injector,
  hostScope: ConcreteServiceScope,
): unknown {
  const wrappers = injector.get(SERVICE_YIELD_WRAPPER, []);
  const context: ServiceYieldContext = {
    name: request.name,
    scope: request.scope,
    hostScope,
    injector,
    resolve: () => request.resolve(injector, hostScope),
  };

  if (wrappers.length === 0) {
    return context.resolve();
  }

  let wrapped: () => Generator<unknown, unknown, unknown> = function* () {
    return context.resolve();
  };

  for (let index = wrappers.length - 1; index >= 0; index -= 1) {
    const wrapper = wrappers[index]!;
    const next = wrapped;
    wrapped = () =>
      (function* () {
        return yield* wrapper(context, next);
      })();
  }

  return runCraftGenerator({
    iterator: wrapped(),
    injector,
    hostScope,
    invalidYieldErrorMessage:
      'Service yield wrappers can only yield Craft dependencies.',
    multipleAppStartErrorMessage:
      'Service yield wrappers cannot declare multiple app-start hooks.',
    onAppStartNotSupportedErrorMessage:
      'Service yield wrappers cannot declare app-start hooks.',
  }).value;
}

function isServiceYieldRequest(
  value: unknown,
): value is RuntimeServiceYieldRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    SERVICE_YIELD_REQUEST_MARKER in value
  );
}

function isServiceDependencyAccessRequest(
  value: unknown,
): value is RuntimeServiceDependencyAccessRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    SERVICE_DEPENDENCY_ACCESS_MARKER in value
  );
}

export function isServiceAppStartRequest(
  value: unknown,
): value is RuntimeServiceAppStartRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    SERVICE_APP_START_REQUEST_MARKER in value
  );
}

function isServiceTrackedDepsRequest(
  value: unknown,
): value is RuntimeServiceTrackedDepsRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    SERVICE_TRACKED_DEPS_REQUEST_MARKER in value
  );
}
