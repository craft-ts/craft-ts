import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  inject,
  Injector,
  runInInjectionContext,
  type CreateComputedOptions,
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import {
  isGeneratorFunction,
  runCraftGenerator,
} from './craft-generator-runtime';
import type { ExtractCraftGenExceptions } from './craft-gen';
import type {
  CraftSettledBrand,
  CraftPendingProbeBrand,
  ExtractCraftPendingHandled,
  ExtractCraftPendingSources,
} from './craft-settled';
import { APP_SNAPSHOT_REGISTRY } from './take-app-snapshot';
import { markYieldableMethod, markYieldableValue } from './yieldable';
import type { NamedYieldableValue, YieldableMethod } from './yieldable';

type CraftComputedGenerator<This, Yielded, T> = (
  this: This,
) => Generator<Yielded, () => T, unknown>;

/**
 * A computation that read a `settledValue` through `yield* settled(...)` inherits
 * its source's two obligations: the async source must be covered by a
 * `pendingBlock`, and its exceptions by a `catchBlock`. Both travel as the
 * {@link CraftSettledBrand} of the resulting signal, so a template rendering it
 * is checked exactly as if it rendered the `settledValue` itself.
 *
 * Computations with no async dependency keep their previous exact type.
 */
type SettledBrandFromYielded<Yielded> = [
  ExtractCraftPendingSources<Yielded>,
] extends [never]
  ? {}
  : CraftSettledBrand<
      ExtractCraftPendingSources<Yielded>,
      ExtractCraftGenExceptions<Yielded>
    >;

type PendingHandledBrandFromYielded<Yielded> = [
  ExtractCraftPendingHandled<Yielded>,
] extends [never]
  ? {}
  : CraftPendingProbeBrand<ExtractCraftPendingHandled<Yielded>>;

type TrackedCraftComputed<Name extends string, T, Yielded> = Signal<T> &
  YieldableMethod<[], T, Yielded> & {
    readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
  } & NamedYieldableValue<Name, Signal<T>> &
  SettledBrandFromYielded<Yielded> &
  PendingHandledBrandFromYielded<Yielded>;

// Host-bound forms — `craftComputed('name', this, function* () { ... })` — bind
// `this` inside the factory (and the computation it returns) to the given host,
// so a class-field initializer can read instance state (mirrors `craftMethod`).
// Without a host, a `function*` factory is called with `this = undefined`.
// The generator overloads must come first: a generator function also matches
// `() => T` (with `T` inferred as the whole `Generator<...>`), so the plain
// overload would otherwise win and type the signal as `Signal<Generator<...>>`.
export function craftComputed<Name extends string, This, Yielded, T>(
  name: Name,
  host: This,
  factory: CraftComputedGenerator<This, Yielded, T>,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<Name, T, Yielded>;
export function craftComputed<Name extends string, Yielded, T>(
  name: Name,
  factory: CraftComputedGenerator<void, Yielded, T>,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<Name, T, Yielded>;
export function craftComputed<Name extends string, This, T>(
  name: Name,
  host: This,
  computation: (this: This) => T,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<Name, T, never>;
export function craftComputed<Name extends string, T>(
  name: Name,
  computation: () => T,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<Name, T, never>;
export function craftComputed<T>(
  name: string,
  hostOrComputation: unknown,
  factoryOrOptions?: unknown,
  maybeOptions?: CreateComputedOptions<T>,
): TrackedCraftComputed<string, T, unknown> {
  // The host form is recognized by its 3rd argument being the factory —
  // `options` is never a function.
  const hasHost = typeof factoryOrOptions === 'function';
  const host = hasHost ? hostOrComputation : undefined;
  const computationOrFactory = (
    hasHost ? factoryOrOptions : hostOrComputation
  ) as ((this: unknown) => T) | CraftComputedGenerator<unknown, unknown, T>;
  const options = (hasHost ? maybeOptions : factoryOrOptions) as
    | CreateComputedOptions<T>
    | undefined;

  assertInInjectionContext(craftComputed);
  const injector = inject(Injector);
  const computedInjector = ɵcreateHostTaggedInjector(
    injector,
    `computed:${name}`,
  );

  let result: Signal<T>;

  if (isGeneratorFunction(computationOrFactory)) {
    const computationFn = runInInjectionContext(computedInjector, () => {
      const iterator = (
        computationOrFactory as CraftComputedGenerator<unknown, unknown, T>
      ).call(host);
      return runCraftGenerator({
        iterator,
        injector: computedInjector,
        hostScope: 'function',
        invalidYieldErrorMessage:
          'craftComputed generators can only yield craftService dependencies.',
        multipleAppStartErrorMessage:
          'craftComputed generators cannot declare onAppStart(...) more than once.',
        onAppStartNotSupportedErrorMessage:
          'craftComputed(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
      }).value as unknown as () => T;
    });
    result = computed(computationFn, options);
  } else {
    const computation = computationOrFactory as (this: unknown) => T;
    result = computed(
      hasHost ? () => computation.call(host) : (computation as () => T),
      options,
    );
  }

  const registry = inject(APP_SNAPSHOT_REGISTRY, { optional: true });
  if (registry) {
    const sig = result;
    const from = computedInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    const destroyRef = computedInjector.get(DestroyRef, null);
    if (destroyRef) {
      registry.triggerSnapshot$
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => {
          let stateSnapshot: unknown;
          try {
            stateSnapshot = sig();
          } catch (error) {
            stateSnapshot = {
              error: error instanceof Error ? error.message : String(error),
            };
          }
          registry.allSnapShot$.next({
            source: name,
            from,
            state: stateSnapshot,
          });
        });
    }
  }

  return markYieldableValue(
    markYieldableMethod(result),
    name,
  ) as unknown as TrackedCraftComputed<string, T, unknown>;
}
