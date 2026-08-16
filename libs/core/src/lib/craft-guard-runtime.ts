import { Injector, runInInjectionContext } from '@angular/core';
import type { CraftRouter, CraftUrlTree } from './craft-router';

type CraftRouteRouterLike = {
  readonly url?: string;
  createUrlTree: (...args: any[]) => unknown;
  navigate: (...args: any[]) => Promise<boolean>;
  navigateByUrl: (...args: any[]) => Promise<boolean>;
};
import { isCraftException, type AnyCraftException } from './craft-exception';
import {
  craftExceptionOutcomeApi,
  type CraftExceptionComponentInput,
  type CraftExceptionHandlerContext,
  type CraftExceptionOutcome,
  type CraftRoutePhase,
} from './craft-route-exceptions';
import { isGenerator } from './craft-generator-runtime';
import {
  driveCraftProgramAsync,
  pumpCraftProgramSync,
  type CraftProgramPumpOptions,
  type CraftProgramSettledStep,
} from './craft-program-runtime';
import { executeCraftRouterTrace } from './craft-router-trace';

const GUARD_INVALID_YIELD_ERROR_MESSAGE =
  'craft route guards can only yield craftService dependencies, exposed dependency helpers, or an craftUntilSettled/craftUntilDefined await request.';

const GUARD_PUMP_OPTIONS: CraftProgramPumpOptions = {
  invalidYieldErrorMessage: GUARD_INVALID_YIELD_ERROR_MESSAGE,
};

/**
 * The result of a synchronous guard re-evaluation (reactive "live" guards):
 * - `valid` — the guard passed without producing an exception;
 * - `exception` — the guard short-circuited / returned a `craftException`;
 * - `pending` — the guard suspended on a not-yet-settled `craftUntilSettled` (cannot be
 *   resolved synchronously) — the reactive check treats this as "still valid".
 */
export type CraftGuardSyncResult =
  | { kind: 'valid'; value: unknown }
  | { kind: 'exception'; exception: AnyCraftException }
  | { kind: 'pending' };

/**
 * Evaluates a guard generator **synchronously** for the reactive `phase: 'active'`
 * re-check. Pumping the generator reads the craft signals it yields synchronously,
 * so an enclosing `effect` tracks them; a settled `craftUntilSettled` resolves on the
 * fast path, while a not-yet-settled await yields `'pending'` (no suspension).
 */
export function evaluateCraftGuardSync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
): CraftGuardSyncResult {
  const step = executeCraftRouterTrace(
    injector,
    {
      kind: 'routeStage',
      phase: 'run',
      stage: 'guard',
      routePhase: 'active',
    },
    () =>
      runInInjectionContext(injector, () =>
        pumpCraftProgramSync(iterator, injector, GUARD_PUMP_OPTIONS),
      ),
  );

  if (step.kind === 'await') {
    return { kind: 'pending' };
  }

  if (step.kind === 'shortCircuit') {
    return { kind: 'exception', exception: step.exception };
  }

  return isCraftException(step.value)
    ? { kind: 'exception', exception: step.value }
    : { kind: 'valid', value: step.value };
}

// ---------------------------------------------------------------------------
// Non-blocking route chain driver.
//
// Drives a route's `canActivate` → `resolve` chain *after* the URL has committed
// (the `CraftRouterOutlet` calls this), routing any `craftException` through the
// route's exhaustive `handleExceptions` map to a {@link RouteChainOutcome}.
// It never returns a `GuardResult`/`Observable` — the outlet owns rendering, and
// mounts the target only on `'data'`/`'noop'`.
// ---------------------------------------------------------------------------

/** The settled result of a route's guard/resolve chain, consumed by the outlet. */
export type RouteChainOutcome =
  | { kind: 'data'; guardData: unknown; resolveData: unknown }
  | { kind: 'redirect'; target: CraftUrlTree | string }
  | {
      kind: 'render';
      component: CraftExceptionComponentInput;
      exception: AnyCraftException;
    }
  | { kind: 'global'; exception: AnyCraftException }
  | { kind: 'stay' }
  | { kind: 'noop' }
  | { kind: 'thrownError'; error: unknown };

export type CraftRouteExceptionHandler = (
  context: CraftExceptionHandlerContext<AnyCraftException>,
) => Generator<unknown, CraftExceptionOutcome, unknown>;

/** Runtime view of a route's `handleExceptions`, keyed by exception code. */
export type CraftRouteExceptionHandlerMap = Record<
  string,
  CraftRouteExceptionHandler | undefined
>;

export interface CraftRouteChainSteps {
  /** `canMatch` generator — run first; its success value is discarded. */
  match?: Generator<unknown, unknown, unknown>;
  /** `canActivate` generator — its success value is the route's guarded data. */
  guard?: Generator<unknown, unknown, unknown>;
  /** `resolve` generator — its success value is the route's resolved data. */
  resolve?: Generator<unknown, unknown, unknown>;
}

function mapOutcome(
  outcome: CraftExceptionOutcome,
  exception: AnyCraftException,
): RouteChainOutcome {
  switch (outcome.kind) {
    case 'redirect':
      return { kind: 'redirect', target: outcome.target };
    case 'render':
      return { kind: 'render', component: outcome.component, exception };
    case 'global':
      return { kind: 'global', exception };
    case 'stay':
      return { kind: 'stay' };
    case 'noop':
      return { kind: 'noop' };
  }
}

// Resolves one exception through `handleExceptions`. A generator handler (it
// `yield*`s craft services before its outcome) is delegated to so its yields
// reach the driver, exactly like a generator guard/resolve stage.
function* resolveRouteException(
  exception: AnyCraftException,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Generator<unknown, RouteChainOutcome, unknown> {
  const handler = handleExceptions[exception.code];

  if (!handler) {
    // No handler for this code — surface as a thrown error (the outlet defaults
    // unhandled errors to the global error component).
    return { kind: 'thrownError', error: exception };
  }

  const context: CraftExceptionHandlerContext<AnyCraftException> = {
    ...craftExceptionOutcomeApi,
    exception,
    payload: exception.payload,
    phase,
    router: router as CraftRouter,
    createUrlTree: router.createUrlTree.bind(router) as CraftRouter['createUrlTree'],
    navigate: router.navigate.bind(router) as CraftRouter['navigate'],
    navigateByUrl: router.navigateByUrl.bind(
      router,
    ) as CraftRouter['navigateByUrl'],
  };

  const result = handler(context);
  if (!isGenerator(result)) {
    throw new Error(
      'Route exception handlers must be wrapped with craftExceptionHandler(function* (...) {}).',
    );
  }
  const outcome = yield* result;

  return mapOutcome(outcome, exception);
}

// Drives any composing generator (guard, resolve, or exception handler) to a
// settled step, going async only across real `craftUntilSettled`/`craftUntilDefined`
// awaits — reusing the same pump/await plumbing as the synchronous re-check.
async function driveStageToSettled(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
): Promise<CraftProgramSettledStep> {
  const first = runInInjectionContext(injector, () =>
    pumpCraftProgramSync(iterator, injector, GUARD_PUMP_OPTIONS),
  );

  return driveCraftProgramAsync(iterator, injector, first, GUARD_PUMP_OPTIONS);
}

async function resolveExceptionOutcomeInternal(
  exception: AnyCraftException,
  injector: Injector,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Promise<RouteChainOutcome> {
  const iterator = resolveRouteException(
    exception,
    router,
    handleExceptions,
    phase,
  );
  const first = runInInjectionContext(injector, () =>
    pumpCraftProgramSync(iterator, injector, GUARD_PUMP_OPTIONS),
  );

  if (first.kind === 'await') {
    throw new Error(
      'Route exception handlers cannot suspend with craftUntilSettled/craftUntilDefined.',
    );
  }

  // A handler that itself short-circuited (rare) cannot be handled again —
  // surface it as a thrown error.
  return first.kind === 'shortCircuit'
    ? { kind: 'thrownError', error: first.exception }
    : (first.value as RouteChainOutcome);
}

async function resolveExceptionOutcome(
  exception: AnyCraftException,
  injector: Injector,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Promise<RouteChainOutcome> {
  return executeCraftRouterTrace(
    injector,
    {
      kind: 'routeStage',
      phase: 'run',
      stage: 'exceptionHandler',
      routePhase: phase,
      url: router.url ?? '',
    },
    () =>
      resolveExceptionOutcomeInternal(
        exception,
        injector,
        router,
        handleExceptions,
        phase,
      ),
  );
}

// Drives one data stage (guard or resolve): either it yields an outcome to
// short-circuit the whole chain (an exception was handled), or it produces the
// stage's success data.
async function driveDataStage(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Promise<{ outcome: RouteChainOutcome } | { data: unknown }> {
  const settled = await driveStageToSettled(iterator, injector);

  // A stage may signal an exception by throwing (`CraftGenShortCircuit`) or by
  // returning a bare `craftException` — handle both (mirrors the handler path).
  const exception =
    settled.kind === 'shortCircuit'
      ? settled.exception
      : isCraftException(settled.value)
        ? settled.value
        : undefined;

  if (exception) {
    return {
      outcome: await resolveExceptionOutcome(
        exception,
        injector,
        router,
        handleExceptions,
        phase,
      ),
    };
  }

  return { data: settled.kind === 'done' ? settled.value : undefined };
}

async function driveTracedDataStage(
  stage: 'match' | 'guard' | 'resolve',
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Promise<{ outcome: RouteChainOutcome } | { data: unknown }> {
  return executeCraftRouterTrace(
    injector,
    {
      kind: 'routeStage',
      phase: 'run',
      stage,
      routePhase: phase,
      url: router.url ?? '',
    },
    () => driveDataStage(iterator, injector, router, handleExceptions, phase),
  );
}

/**
 * Drives a route's `canActivate` → `resolve` chain to a {@link RouteChainOutcome}.
 *
 * `phase` is `'enter'` for the initial activation and `'active'` for a reactive
 * guard re-evaluation; it is forwarded to each exception handler so a handler can
 * react differently (e.g. a softer redirect on session expiry).
 */
async function runCraftRouteChainAsyncInternal(
  steps: CraftRouteChainSteps,
  injector: Injector,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase = 'enter',
): Promise<RouteChainOutcome> {
  try {
    if (steps.match) {
      const result = await driveTracedDataStage(
        'match',
        steps.match,
        injector,
        router,
        handleExceptions,
        phase,
      );

      // `canMatch` only gates: an exception short-circuits the chain; its
      // success value is discarded (no data path).
      if ('outcome' in result) {
        return result.outcome;
      }
    }

    let guardData: unknown;

    if (steps.guard) {
      const result = await driveTracedDataStage(
        'guard',
        steps.guard,
        injector,
        router,
        handleExceptions,
        phase,
      );

      if ('outcome' in result) {
        return result.outcome;
      }

      guardData = result.data;
    }

    let resolveData: unknown;

    if (steps.resolve) {
      const result = await driveTracedDataStage(
        'resolve',
        steps.resolve,
        injector,
        router,
        handleExceptions,
        phase,
      );

      if ('outcome' in result) {
        return result.outcome;
      }

      resolveData = result.data;
    }

    return { kind: 'data', guardData, resolveData };
  } catch (error) {
    // A rethrown `craftException` (e.g. the generic `HttpError`) routes through
    // `handleExceptions` when a matching handler exists; anything else (a real
    // error, or an unhandled code) becomes a thrown error → global by default.
    if (isCraftException(error) && handleExceptions[error.code]) {
      try {
        return await resolveExceptionOutcome(
          error,
          injector,
          router,
          handleExceptions,
          phase,
        );
      } catch (handlerError) {
        return { kind: 'thrownError', error: handlerError };
      }
    }

    return { kind: 'thrownError', error };
  }
}

export function runCraftRouteChainAsync(
  steps: CraftRouteChainSteps,
  injector: Injector,
  router: CraftRouteRouterLike,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase = 'enter',
): Promise<RouteChainOutcome> {
  return executeCraftRouterTrace(
    injector,
    {
      kind: 'routeChain',
      phase: 'run',
      routePhase: phase,
      url: router.url ?? '',
    },
    () =>
      runCraftRouteChainAsyncInternal(
        steps,
        injector,
        router,
        handleExceptions,
        phase,
      ),
  );
}
