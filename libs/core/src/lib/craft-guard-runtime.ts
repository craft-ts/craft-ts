import { computed, Injector, runInInjectionContext } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { GuardResult, Router } from '@angular/router';
import { filter, from, take } from 'rxjs';
import { isCraftException, type AnyCraftException } from './craft-exception';
import { isCraftGenShortCircuit } from './craft-gen';
import {
  isGenerator,
  isGuardAwaitRequest,
  resolveCraftGeneratorYield,
  type GuardAwaitResourceLike,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';

// The redirect helpers plus the resolved exception handed to each resolver. Kept
// structural here (the precisely-typed counterpart lives in craft-routes) so the
// guard runtime stays independent of the route type plumbing.
export type CraftGuardExceptionResolverContext = {
  createUrlTree: Router['createUrlTree'];
  navigate: Router['navigate'];
  navigateByUrl: Router['navigateByUrl'];
  router: Router;
  exception: AnyCraftException;
  payload: unknown;
};

export type CraftGuardResolverMap = Record<
  string,
  | ((
      context: CraftGuardExceptionResolverContext,
    ) => GuardResult | Generator<unknown, GuardResult, unknown>)
  | undefined
>;

const GUARD_INVALID_YIELD_ERROR_MESSAGE =
  'craft route guards can only yield craftService dependencies, exposed dependency helpers, or an untilSettled/untilDefined await request.';

type GuardPumpResult =
  | { kind: 'done'; value: unknown }
  | { kind: 'await'; request: RuntimeGuardAwaitRequest }
  | { kind: 'shortCircuit'; exception: AnyCraftException };

type GuardSettledStep = Exclude<GuardPumpResult, { kind: 'await' }>;

// Resolution boundary shared by `craftCanActivate` / `craftCanMatch`: a
// non-exception result passes through; an exception is mapped through its
// resolver (looked up by code, with a defensive runtime throw for an unmapped
// code, which the exhaustive `resolvers` type already prevents). When the
// resolver is a generator (it `yield*`s craft services to build the redirect),
// it is delegated to so its dependency yields reach the driver and resolve.
export function* resolveCraftGuardResult(
  result: unknown,
  router: Router,
  resolverMap: CraftGuardResolverMap,
): Generator<unknown, unknown, unknown> {
  if (!isCraftException(result)) {
    return result;
  }

  const resolver = resolverMap[result.code];

  if (!resolver) {
    throw new Error(`Unhandled guard exception: ${result.code}`);
  }

  const resolved = resolver({
    createUrlTree: router.createUrlTree.bind(router),
    navigate: router.navigate.bind(router),
    navigateByUrl: router.navigateByUrl.bind(router),
    router,
    exception: result,
    payload: result.payload,
  });

  return isGenerator(resolved) ? yield* resolved : resolved;
}

// Pumps `iterator` synchronously, resolving craft service yields, until it
// completes, throws a `CraftGenShortCircuit` (caught and surfaced as the carried
// exception), or yields a guard await-request — at which point the iterator is
// left positioned right after the await so the caller can resume it once the
// awaited value is available. `resumeValue` feeds the first `next(...)` (used to
// resume after an await; ignored on the initial pump).
function pumpGuardSync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  resumeValue?: unknown,
): GuardPumpResult {
  try {
    let current = iterator.next(resumeValue as never);

    while (!current.done) {
      const yielded = current.value;

      if (isGuardAwaitRequest(yielded)) {
        return { kind: 'await', request: yielded };
      }

      const resolution = resolveCraftGeneratorYield(yielded, injector, 'function');

      if (!resolution.handled) {
        throw new Error(GUARD_INVALID_YIELD_ERROR_MESSAGE);
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

  return status === 'resolved' || status === 'error';
}

// Bridges a single guard await-request to a Promise: `'promise'` requests await
// the thenable directly; `'settle'` requests subscribe to the resource's settled
// status (computed off its signals, observed on `injector`) and resolve on the
// first settle.
function awaitGuardRequest(
  request: RuntimeGuardAwaitRequest,
  injector: Injector,
): Promise<unknown> {
  if (request.kind === 'promise') {
    return Promise.resolve(request.value);
  }

  return new Promise<unknown>((resolve, reject) => {
    try {
      const settled$ = runInInjectionContext(injector, () =>
        toObservable(computed(() => isResourceSettled(request.resource)), {
          injector,
        }),
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
async function driveGuardStageAsync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  step: GuardPumpResult,
): Promise<GuardSettledStep> {
  let current = step;

  while (current.kind === 'await') {
    const value = await awaitGuardRequest(current.request, injector);
    current = runInInjectionContext(injector, () =>
      pumpGuardSync(iterator, injector, value),
    );
  }

  return current;
}

function finalizeGuardResult(step: GuardSettledStep): unknown {
  if (step.kind === 'shortCircuit') {
    // A resolver let an exception escape (the resolver itself short-circuited),
    // or no resolver matched — the exhaustive `resolvers` type prevents this.
    throw new Error(`Unhandled guard exception: ${step.exception.code}`);
  }

  return step.value;
}

// Drives a composing guard to a `GuardResult`, going async only when the guard
// (or a resolver) actually suspends on an `untilSettled`/`untilDefined` await.
//
// Sync fast-path: if neither the guard nor its resolver yields an await-request,
// the bare value is returned synchronously — preserving every existing
// synchronous guard (no forced microtask). The first await escalates to an
// `Observable<GuardResult>` (what `canActivate`/`canMatch` accept for async).
export function runCraftGuardAsync(
  guardIterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  router: Router,
  resolverMap: CraftGuardResolverMap,
): unknown {
  const guardStep = pumpGuardSync(guardIterator, injector);

  if (guardStep.kind === 'await') {
    return from(
      runGuardThenResolve(guardIterator, guardStep, injector, router, resolverMap),
    );
  }

  const result =
    guardStep.kind === 'shortCircuit' ? guardStep.exception : guardStep.value;
  const resolverIterator = resolveCraftGuardResult(result, router, resolverMap);
  const resolverStep = pumpGuardSync(resolverIterator, injector);

  if (resolverStep.kind === 'await') {
    return from(driveResolverAsync(resolverIterator, resolverStep, injector));
  }

  return finalizeGuardResult(resolverStep);
}

async function runGuardThenResolve(
  guardIterator: Generator<unknown, unknown, unknown>,
  guardStep: GuardPumpResult,
  injector: Injector,
  router: Router,
  resolverMap: CraftGuardResolverMap,
): Promise<unknown> {
  const settledGuard = await driveGuardStageAsync(guardIterator, injector, guardStep);
  const result =
    settledGuard.kind === 'shortCircuit'
      ? settledGuard.exception
      : settledGuard.value;
  const resolverIterator = resolveCraftGuardResult(result, router, resolverMap);
  const firstResolverStep = runInInjectionContext(injector, () =>
    pumpGuardSync(resolverIterator, injector),
  );

  return driveResolverAsync(resolverIterator, firstResolverStep, injector);
}

async function driveResolverAsync(
  resolverIterator: Generator<unknown, unknown, unknown>,
  step: GuardPumpResult,
  injector: Injector,
): Promise<unknown> {
  const settled = await driveGuardStageAsync(resolverIterator, injector, step);

  return finalizeGuardResult(settled);
}
