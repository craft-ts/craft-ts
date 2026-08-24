import {
  computed,
  DestroyRef,
  Injector,
  runInInjectionContext,
} from './host/craft-compat';
import { toObservable } from './host/craft-compat';
import { filter, take } from 'rxjs';
import type { AnyCraftException } from './craft-exception';
import { CraftGenShortCircuit, isCraftGenShortCircuit } from './craft-gen';
import {
  GUARD_AWAIT_REQUEST_MARKER,
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

// ---------------------------------------------------------------------------
// Foreign yields.
//
// A "foreign yield" is a value the pump cannot resolve as a craft request —
// canonically an `Effect`, produced by `yield* someEffect`. A registered bridge
// turns such a yield into a promise of a `ForeignYieldOutcome`; the pump then
// suspends on the *existing* `'promise'` await path (nothing new to drive) and,
// on resume, either feeds the success value back into the generator or
// short-circuits with the carried craft exception.
//
// The bridge lives outside this file on purpose, so `libs/core` keeps no
// dependency on `effect`: see `@craft-ts/effect`. Core only knows that
// *something* may claim a yield it does not understand.
// ---------------------------------------------------------------------------

/** What a foreign yield settled to, once its bridge resolved it. */
export type ForeignYieldOutcome =
  | { kind: 'value'; value: unknown }
  | { kind: 'exception'; exception: AnyCraftException };

const FOREIGN_YIELD_OUTCOME = Symbol('foreign-yield-outcome');

type TaggedForeignYieldOutcome = ForeignYieldOutcome & {
  [FOREIGN_YIELD_OUTCOME]: true;
};

function isTaggedForeignYieldOutcome(
  value: unknown,
): value is TaggedForeignYieldOutcome {
  return (
    typeof value === 'object' && value !== null && FOREIGN_YIELD_OUTCOME in value
  );
}

/** The context a bridge needs in order to resolve and run a foreign yield. */
export type ForeignYieldContext = {
  /**
   * The injector of the program that yielded. A bridge resolves its runtime
   * from here, which is what makes per-route runtimes and their inheritance
   * possible at all.
   */
  readonly injector: Injector;
  /** Aborted when the owning program is superseded or destroyed. */
  readonly abortSignal?: AbortSignal;
};

/**
 * Returns a promise for yields it recognises, `undefined` for everything else
 * (which then falls through to the usual invalid-yield error).
 */
export type ForeignYieldBridge = (
  yielded: unknown,
  context: ForeignYieldContext,
) => PromiseLike<ForeignYieldOutcome> | undefined;

let foreignYieldBridge: ForeignYieldBridge | undefined;

/** Registers the bridge; returns a disposer restoring the previous one. */
export function setForeignYieldBridge(bridge: ForeignYieldBridge): () => void {
  const previous = foreignYieldBridge;
  foreignYieldBridge = bridge;
  return () => {
    foreignYieldBridge = previous;
  };
}

/** @deprecated Prototype spelling, kept for the wave-0 fixtures. */
export const ɵsetForeignYieldBridge = setForeignYieldBridge;

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
    // A resumed foreign yield either carries its value back into the generator
    // or short-circuits here, so the exception lands on the regular
    // `shortCircuit` step rather than surfacing as a thrown error.
    let resumeWith = resumeValue;
    if (isTaggedForeignYieldOutcome(resumeWith)) {
      if (resumeWith.kind === 'exception') {
        throw new CraftGenShortCircuit(resumeWith.exception);
      }
      resumeWith = resumeWith.value;
    }

    let current = iterator.next(resumeWith as never);

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

        // Last chance before the invalid-yield error: a bridged foreign yield
        // suspends through the existing `'promise'` await path.
        const bridged = foreignYieldBridge?.(yielded, {
          injector,
          abortSignal: options.abortSignal,
        });
        if (bridged) {
          return {
            kind: 'await',
            request: {
              [GUARD_AWAIT_REQUEST_MARKER]: true,
              kind: 'promise',
              value: bridged.then((outcome) => ({
                ...outcome,
                [FOREIGN_YIELD_OUTCOME]: true as const,
              })),
            },
          };
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
