import {
  computed,
  DestroyRef,
  Injector,
  runInInjectionContext,
} from './host/craft-compat';
import { toObservable } from './host/craft-compat';
import { filter, take } from 'rxjs';
import type { AnyCraftException } from './craft-exception';
import { isCraftGenShortCircuit } from './craft-gen';
import {
  isGenerator,
  isGuardAwaitRequest,
  isServiceAppStartRequest,
  resolveCraftGeneratorYield,
  type GuardAwaitResourceLike,
  type RuntimeAwaitRequest,
} from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import { ɵcraftInjectorFromHost } from './host/craft-injector-host';
import {
  CRAFT_TEMPORAL_RUNTIME,
  isTemporalAwaitRequest,
  RealCraftTemporalRuntime,
  TemporalCancelledError,
} from './temporal-runtime';

// ---------------------------------------------------------------------------
// Generic async craft-program driver.
//
// A "program" is any craft generator (route guard, resolve stage, exception
// handler, or a primitive's generator loader): it yields craft service
// requests — resolved synchronously — and may suspend on an
// `craftUntilSettled`/`craftUntilDefined` await-request. The driver pumps synchronously
// between awaits and goes async only across real suspensions; a
// `CraftGenShortCircuit` (a composed `craftGen` producing a `craftException`)
// settles as a structured `shortCircuit` step instead of a thrown error.
// ---------------------------------------------------------------------------

/** A program's driver step: settled (`done`/`shortCircuit`) or suspended on an await. */
export type CraftProgramStep =
  | { kind: 'done'; value: unknown }
  | { kind: 'await'; request: RuntimeAwaitRequest }
  | { kind: 'shortCircuit'; exception: AnyCraftException };

/** A settled program step (the `await` suspension already driven through). */
export type CraftProgramSettledStep = Exclude<
  CraftProgramStep,
  { kind: 'await' }
>;

export type CraftProgramPumpOptions = {
  /** Error raised when the program yields something the driver cannot resolve. */
  invalidYieldErrorMessage: string;
  /**
   * When set, an `onAppStart(...)` yield raises this dedicated error instead of
   * the generic invalid-yield one (primitive loaders keep their historical
   * message); when omitted, an app-start yield falls through to
   * `invalidYieldErrorMessage` (route guards).
   */
  appStartNotSupportedErrorMessage?: string;
  /** Abort signal for temporal awaits owned by the current async program. */
  abortSignal?: AbortSignal;
};

// Pumps `iterator` synchronously, resolving craft service yields, until it
// completes, throws a `CraftGenShortCircuit` (caught and surfaced as the carried
// exception), or yields an await-request — at which point the iterator is
// left positioned right after the await so the caller can resume it once the
// awaited value is available. `resumeValue` feeds the first `next(...)` (used to
// resume after an await; ignored on the initial pump).
export function pumpCraftProgramSync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  options: CraftProgramPumpOptions,
  resumeValue?: unknown,
): CraftProgramStep {
  try {
    let current = iterator.next(resumeValue as never);

    while (!current.done) {
      const yielded = current.value;

      if (isGuardAwaitRequest(yielded) || isTemporalAwaitRequest(yielded)) {
        return { kind: 'await', request: yielded };
      }

      const resolution = resolveCraftGeneratorYield(
        yielded,
        injector,
        'function',
      );

      if (!resolution.handled) {
        if (
          options.appStartNotSupportedErrorMessage &&
          isServiceAppStartRequest(yielded)
        ) {
          throw new Error(options.appStartNotSupportedErrorMessage);
        }

        throw new Error(options.invalidYieldErrorMessage);
      }

      current = iterator.next(resolution.value as never);
    }

    return { kind: 'done', value: current.value };
  } catch (error) {
    if (isCraftGenShortCircuit(error)) {
      return { kind: 'shortCircuit', exception: error.exception };
    }

    throw error;
  }
}

function isResourceSettled(resource: GuardAwaitResourceLike): boolean {
  const status = resource.status();

  // Angular's raw `resource()` reports technical loader failures as `error`,
  // while Craft resources map business failures to `exception`.
  return status === 'resolved' || status === 'exception' || status === 'error';
}

// Bridges a single await-request to a Promise: `'promise'` requests await
// the thenable directly; `'settle'` requests subscribe to the resource's settled
// status (computed off its signals, observed on `injector`) and resolve on the
// first settle.
export function awaitCraftProgramRequest(
  request: RuntimeAwaitRequest,
  injector: Injector,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  if (isTemporalAwaitRequest(request)) {
    const temporalRuntime =
      injector.get(CRAFT_TEMPORAL_RUNTIME, null) ??
      new RealCraftTemporalRuntime();
    return temporalRuntime.sleep(request.delayMs, {
      kind: 'sleep',
      owner: request.owner,
      destroyRef: injector.get(DestroyRef, null) ?? undefined,
      signal: request.signal ?? abortSignal,
    });
  }

  if (request.kind === 'promise') {
    return Promise.resolve(request.value);
  }

  return new Promise<unknown>((resolve, reject) => {
    try {
      const settled$ = runInInjectionContext(injector, () =>
        toObservable(
          computed(() => isResourceSettled(request.resource)),
          {
            injector,
          },
        ),
      ).pipe(
        filter((settled) => settled),
        take(1),
      );

      settled$.subscribe({
        next: () => resolve(undefined),
        error: reject,
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Resumes `iterator` across every await it hits until it settles (completes or
// short-circuits). Each post-await segment runs inside the injection context —
// ambient context is gone after an `await`, so service resolution and the next
// `toObservable({ injector })` need it restored.
export async function driveCraftProgramAsync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  step: CraftProgramStep,
  options: CraftProgramPumpOptions,
): Promise<CraftProgramSettledStep> {
  let current = step;

  while (current.kind === 'await') {
    const value = await awaitCraftProgramRequest(
      current.request,
      injector,
      options.abortSignal,
    );
    if (options.abortSignal?.aborted) {
      throw new TemporalCancelledError();
    }
    current = runInInjectionContext(injector, () =>
      pumpCraftProgramSync(iterator, injector, options, value),
    );
  }

  return current;
}

/**
 * Async counterpart of `executeGeneratorCompatibleFactory`: same contract (a
 * factory that returns either a plain value or a craft generator), but the
 * generator path is driven by the async program pump — `craftUntilSettled` /
 * `craftUntilDefined` awaits suspend instead of erroring, and a
 * `CraftGenShortCircuit` settles as a `shortCircuit` step instead of throwing.
 * The `done` value is awaited (generator loaders may return a bare promise).
 */
export async function executeGeneratorCompatibleFactoryAsync<
  This,
  Args extends unknown[],
  Result,
>({
  factory,
  thisArg,
  getInjector,
  args,
  invalidYieldErrorMessage,
  appStartNotSupportedErrorMessage,
  abortSignal,
}: {
  factory: (this: This, ...args: Args) => Result;
  thisArg: This;
  getInjector: () => Injector | object;
  args: Args;
  invalidYieldErrorMessage: string;
  appStartNotSupportedErrorMessage?: string;
  abortSignal?: AbortSignal;
}): Promise<CraftProgramSettledStep> {
  const injector = ɵcraftInjectorFromHost(getInjector());
  const options: CraftProgramPumpOptions = {
    invalidYieldErrorMessage,
    appStartNotSupportedErrorMessage,
    abortSignal,
  };
  const wrappedFactory = runInInjectionContext(injector, () =>
    injectFnWrapper()(factory),
  );
  const result = wrappedFactory.apply(thisArg, args);

  if (!isGenerator(result)) {
    return { kind: 'done', value: await result };
  }

  const first = runInInjectionContext(injector, () =>
    pumpCraftProgramSync(result, injector, options),
  );
  const settled = await driveCraftProgramAsync(
    result,
    injector,
    first,
    options,
  );

  return settled.kind === 'done'
    ? { kind: 'done', value: await settled.value }
    : settled;
}
