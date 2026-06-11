import { Injector, runInInjectionContext } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ConcreteServiceScope } from './craft-service.shared';
import { injectFnWrapper } from './fn-wrapper';

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

type AppStartResult = Observable<unknown> | Promise<unknown> | void;

type AnyGeneratorFunction = (...args: never[]) => Generator<
  unknown,
  unknown,
  unknown
>;

export type ResolveGeneratorResult<Result> = Result extends Generator<
  any,
  infer Output,
  unknown
>
  ? Output
  : Result;

export type ExtractFactoryYielded<Factory> = Factory extends (
  ...args: any[]
) => Generator<infer Yielded, any, unknown>
  ? Yielded
  : never;

export type GeneratorCompatibleFactory<Factory, Yielded = never> =
  Factory extends (...args: infer Args) => infer Result
    ? (...args: Args) => Result | Generator<Yielded, Result, unknown>
    : never;

type RuntimeServiceYieldRequest<Result = unknown> = Readonly<{
  [SERVICE_YIELD_REQUEST_MARKER]: true;
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
};

export function runCraftGenerator({
  iterator,
  injector,
  hostScope,
  invalidYieldErrorMessage,
  multipleAppStartErrorMessage,
  createAppStartHook,
  onAppStartNotSupportedErrorMessage,
}: RunCraftGeneratorOptions): {
  value: unknown;
  appStartHook?: () => AppStartResult;
} {
  let appStartHook: (() => AppStartResult) | undefined;
  let current = iterator.next();

  while (!current.done) {
    const yielded = current.value;

    if (isServiceYieldRequest(yielded)) {
      current = iterator.next(yielded.resolve(injector, hostScope));
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

export function isGeneratorFunction(value: unknown): value is AnyGeneratorFunction {
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
  const wrappedFactory = runInInjectionContext(injector, () =>
    injectFnWrapper()(factory),
  );
  const result = wrappedFactory.apply(thisArg, args);

  if (!isGenerator(result)) {
    return result as ResolveGeneratorResult<Result>;
  }

  return runInInjectionContext(injector, () => {
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

function isServiceAppStartRequest(
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
