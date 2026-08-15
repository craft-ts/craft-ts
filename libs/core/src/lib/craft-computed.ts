import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
  type CreateComputedOptions,
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  captureCraftSignalReads,
  craftComputed as createCraftComputed,
  craftSignal,
  craftWatch,
} from './host/craft-signal';
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
  ExtractCraftPendingSources,
} from './craft-settled';
import { APP_SNAPSHOT_REGISTRY } from './take-app-snapshot';
import {
  createYieldableReactiveValue,
  REACTIVE_DEPENDENCIES,
  type ReactiveDependencyMapFromYielded,
  ɵactiveReactiveReader,
  type YieldableReactiveValue,
} from './reactive-read';

const createComputedWithOptions = createCraftComputed as unknown as <T>(
  computation: () => T,
  options?: CreateComputedOptions<T>,
) => Signal<T>;

type CraftComputedGenerator<This, Yielded, T> = (
  this: This,
) => Generator<Yielded, T, unknown>;

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

type TrackedCraftComputed<
  Name extends string,
  T,
  Yielded,
> = YieldableReactiveValue<T, Name> & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
} & ([ReactiveDependencyMapFromYielded<Yielded>] extends [never]
    ? {}
    : {
        readonly [REACTIVE_DEPENDENCIES]?: ReactiveDependencyMapFromYielded<Yielded>;
      }) &
  SettledBrandFromYielded<Yielded>;

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
export function craftComputed<Yielded, T>(
  factory: CraftComputedGenerator<void, Yielded, T>,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<'computed', T, Yielded>;
export function craftComputed<T>(
  computation: () => T,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<'computed', T, never>;
export function craftComputed<T>(
  nameOrComputation: string | ((...args: never[]) => unknown),
  hostOrComputation?: unknown,
  factoryOrOptions?: unknown,
  maybeOptions?: CreateComputedOptions<T>,
): TrackedCraftComputed<string, T, unknown> {
  const hasName = typeof nameOrComputation === 'string';
  const name = hasName ? nameOrComputation : 'computed';
  // The host form is recognized by its 3rd argument being the factory —
  // `options` is never a function.
  const hasHost = hasName && typeof factoryOrOptions === 'function';
  const host = hasHost ? hostOrComputation : undefined;
  const computationOrFactory = (
    hasHost ? factoryOrOptions : hasName ? hostOrComputation : nameOrComputation
  ) as ((this: unknown) => T) | CraftComputedGenerator<unknown, unknown, T>;
  const options = (
    hasHost ? maybeOptions : hasName ? factoryOrOptions : hostOrComputation
  ) as CreateComputedOptions<T> | undefined;

  assertInInjectionContext(craftComputed);
  const injector = inject(Injector);
  const computedInjector = ɵcreateHostTaggedInjector(
    injector,
    `computed:${name}`,
  );

  let evaluate: () => T;
  if (isGeneratorFunction(computationOrFactory)) {
    evaluate = () =>
      runInInjectionContext(computedInjector, () => {
        const iterator = (
          computationOrFactory as CraftComputedGenerator<unknown, unknown, T>
        ).call(host);
        return runCraftGenerator({
          iterator,
          injector: computedInjector,
          hostScope: 'function',
          invalidYieldErrorMessage:
            'craftComputed generators can only yield Craft dependencies and reactive read requests; received an unknown yield.',
          multipleAppStartErrorMessage:
            'craftComputed generators cannot declare onAppStart(...) more than once.',
          onAppStartNotSupportedErrorMessage:
            'craftComputed(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
          reactiveReader: ɵactiveReactiveReader() ?? {
            name,
            computed: name,
            path: name,
          },
        }).value as T;
      });
  } else {
    const computation = computationOrFactory as (this: unknown) => T;
    evaluate = hasHost
      ? () => computation.call(host)
      : (computation as () => T);
  }

  const angularRevision = craftSignal(0);
  let capturedCraftReads: readonly (() => unknown)[] = [];
  let evaluationVersion = 0;
  const memoized = createComputedWithOptions(() => {
    angularRevision();
    const captured = captureCraftSignalReads(evaluate);
    capturedCraftReads = captured.reads;
    evaluationVersion++;
    return captured.value;
  }, options);
  const angularMemoRevision = signal(0);
  let angularMemoInitialized = false;
  const angularMemo = computed(() => {
    angularMemoRevision();
    if (angularMemoInitialized) {
      angularRevision.update((revision) => revision + 1);
    }
    angularMemoInitialized = true;
    return memoized();
  });
  const craftBridgeRevision = signal(0);
  let craftBridgeWatch: { destroy(): void } | undefined;
  let installedEvaluationVersion = -1;
  const installCraftBridge = (): void => {
    craftBridgeWatch?.destroy();
    let initialRun = true;
    craftBridgeWatch = craftWatch(() => {
      if (initialRun) {
        for (const read of capturedCraftReads) {
          read();
        }
        return undefined;
      }
      untracked(() => craftBridgeRevision.update((revision) => revision + 1));
      return undefined;
    });
    initialRun = false;
    installedEvaluationVersion = evaluationVersion;
  };
  computedInjector.get(DestroyRef).onDestroy(() => craftBridgeWatch?.destroy());
  let previousCraftBridgeRevision = -1;
  const result = (() => {
    const currentCraftBridgeRevision = craftBridgeRevision();
    if (
      previousCraftBridgeRevision !== -1 &&
      currentCraftBridgeRevision !== previousCraftBridgeRevision
    ) {
      untracked(() => angularMemoRevision.update((revision) => revision + 1));
    }
    const value = angularMemo();
    if (!craftBridgeWatch || installedEvaluationVersion !== evaluationVersion) {
      installCraftBridge();
    }
    previousCraftBridgeRevision = currentCraftBridgeRevision;
    return value;
  }) as Signal<T>;

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

  return createYieldableReactiveValue(result, name, {
    computed: name,
    path: name,
  }) as unknown as TrackedCraftComputed<string, T, unknown>;
}
