import {
  inject,
  Injector,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import {
  Console,
  executeGeneratorCompatibleFactory,
  provideCraftHttpTrace,
  provideCraftRouterTrace,
  provideCraftDomEventHook,
  provideFnWrapper,
  provideTemplateTrace,
  type CraftHttpTraceWrapper,
  type CraftRouterTraceWrapper,
  type FnWrapper,
  type TemplateTraceContext,
} from '@craft-ng/core';

let logging = false;

function logTrace(label: string, value: unknown): void {
  if (logging) {
    return;
  }

  logging = true;
  try {
    executeGeneratorCompatibleFactory({
      factory: function* () {
        yield* Console.log(label, value);
      },
      thisArg: undefined,
      args: [],
      getInjector: () => inject(Injector),
      invalidYieldErrorMessage: 'Demo tracing yielded an invalid value',
      multipleAppStartErrorMessage:
        'Demo tracing cannot register multiple app-start hooks',
    });
  } finally {
    logging = false;
  }
}

function logTemplateTrace(context: TemplateTraceContext): void {
  logTrace('[trace:template]', context);
}

const demoFnTrace: FnWrapper = function* (factory, thisArg, args) {
  const name = factory.name || '<anonymous>';
  if (logging) {
    return yield* factory.apply(thisArg, args);
  }

  try {
    logTrace('[trace:function:start]', {
      name,
      args,
    });
    const result = yield* factory.apply(thisArg, args);
    logTrace('[trace:function:end]', { name, result });
    return result;
  } catch (error) {
    logTrace('[trace:function:error]', { name, error });
    throw error;
  }
};

function traceAsync<T>(label: string, context: unknown, next: () => T): T {
  logTrace(`${label}:start`, context);
  try {
    const result = next();
    if (isPromiseLike(result)) {
      return result.then(
        (value) => {
          logTrace(`${label}:end`, { context, result: value });
          return value;
        },
        (error) => {
          logTrace(`${label}:error`, { context, error });
          throw error;
        },
      ) as T;
    }
    logTrace(`${label}:end`, { context, result });
    return result;
  } catch (error) {
    logTrace(`${label}:error`, { context, error });
    throw error;
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

const demoRouterTrace: CraftRouterTraceWrapper = (context, next) =>
  traceAsync('[trace:router]', context, next);

const demoHttpTrace: CraftHttpTraceWrapper = (context, next) =>
  traceAsync('[trace:http]', context, next);

export function provideDemoTracing(): (Provider | EnvironmentProviders)[] {
  return [
    provideTemplateTrace((context, next) => {
      logTemplateTrace(context);
      return next();
    }),
    provideCraftRouterTrace(demoRouterTrace),
    provideCraftHttpTrace(demoHttpTrace),
    provideCraftDomEventHook((interaction, next) =>
      traceAsync('[trace:dom]', interaction, next),
    ),
    provideFnWrapper(
      'Warning: the demo tracing wrapper logs every wrapped Craft factory',
      demoFnTrace,
    ),
  ];
}
