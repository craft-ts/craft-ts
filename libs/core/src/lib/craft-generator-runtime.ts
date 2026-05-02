import type { Injector } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ConcreteServiceScope } from './craft-service.shared';

export const SERVICE_YIELD_REQUEST_MARKER = Symbol(
  'service-yield-request-marker',
);
export const SERVICE_DEPENDENCY_ACCESS_MARKER = Symbol(
  'service-dependency-access-marker',
);
export const SERVICE_APP_START_REQUEST_MARKER = Symbol(
  'service-app-start-request-marker',
);

type AppStartResult = Observable<unknown> | Promise<unknown> | void;

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
