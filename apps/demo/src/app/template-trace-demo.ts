import {
  craftUntracked as untracked,
  type EnvironmentProviders,
  type Provider,
  ɵinject as inject,
  ɵInjector as Injector,
} from '@craft-ts/core';
import {
  Console,
  craftException,
  executeGeneratorCompatibleFactory,
  isCraftGenShortCircuit,
  isCraftNotSettled,
  provideCraftHttpTrace,
  provideCraftRouterTrace,
  provideCraftDomEventHook,
  provideFnWrapper,
  provideTemplateTrace,
  type CraftHttpTraceWrapper,
  type CraftRouterTraceWrapper,
  type FnWrapper,
  type TemplateTraceContext,
} from '@craft-ts/core';

let logging = false;

function optionalAngularInjector(): Injector | undefined {
  try {
    return inject(Injector);
  } catch {
    return undefined;
  }
}

function isDestroyedInjector(injector: Injector): boolean {
  return (
    'destroyed' in injector &&
    (injector as Injector & { destroyed?: boolean }).destroyed === true
  );
}

function logTrace(label: string, value: unknown, injector?: Injector): void {
  if (logging) {
    return;
  }

  const resolvedInjector = injector ?? optionalAngularInjector();
  if (!resolvedInjector || isDestroyedInjector(resolvedInjector)) {
    return;
  }

  logging = true;
  try {
    untracked(() =>
      executeGeneratorCompatibleFactory({
        factory: function* () {
          yield* Console.log(label, value);
        },
        thisArg: undefined,
        args: [],
        getInjector: () => resolvedInjector,
        invalidYieldErrorMessage: 'Demo tracing yielded an invalid value',
        multipleAppStartErrorMessage:
          'Demo tracing cannot register multiple app-start hooks',
      }),
    );
  } catch {
    // Tracing must never throw into the app (NG0205 after destroy, NG0203, …).
  } finally {
    logging = false;
  }
}

function logTemplateTrace(context: TemplateTraceContext): void {
  logTrace('[trace:template]', context);
}

/**
 * Control-flow signals, not failures: a `CraftGenShortCircuit` is on its way to
 * a `catchBlock`, a `CraftNotSettled` to a `pendingBlock`. Turning them into an
 * `UNEXPECTED_ERROR` here would strand them — the boundary never sees them and
 * the fabricated exception renders in their place.
 */
function isCraftControlFlow(error: unknown): boolean {
  return isCraftGenShortCircuit(error) || isCraftNotSettled(error);
}

const demoFnTrace: FnWrapper = function* (factory, thisArg, args) {
  const name = factory.name || '<anonymous>';
  const injector = optionalAngularInjector();
  if (logging) {
    return yield* factory.apply(thisArg, args);
  }

  try {
    logTrace('[trace:function:start]', { name, args }, injector);
    const result = yield* factory.apply(thisArg, args);
    logTrace('[trace:function:end]', { name, result }, injector);
    return result;
  } catch (error) {
    if (isCraftControlFlow(error)) {
      throw error;
    }
    logTrace('[trace:function:error]', { name, error }, injector);
    return craftException({ code: 'UNEXPECTED_ERROR' }, { error });
  }
};

function traceAsync<T>(label: string, context: unknown, next: () => T): T {
  // Promise callbacks run after Angular's synchronous injection context has
  // ended. Capture the injector while the wrapper is still in that context so
  // the completion/error logs can reuse it safely.
  const injector = inject(Injector);

  logTrace(`${label}:start`, context, injector);
  try {
    const result = next();
    if (isPromiseLike(result)) {
      return result.then(
        (value) => {
          logTrace(`${label}:end`, { context, result: value }, injector);
          return value;
        },
        (error) => {
          if (isCraftControlFlow(error)) {
            throw error;
          }
          logTrace(`${label}:error`, { context, error }, injector);
          return craftException({ code: 'UNEXPECTED_ERROR' }, { error });
        },
      ) as T;
    }
    logTrace(`${label}:end`, { context, result }, injector);
    return result;
  } catch (error) {
    if (isCraftControlFlow(error)) {
      throw error;
    }
    logTrace(`${label}:error`, { context, error }, injector);
    return craftException({ code: 'UNEXPECTED_ERROR' }, { error }) as T;
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
