import {
  assertInInjectionContext,
  computed,
  inject,
  Injector,
  runInInjectionContext,
  type CreateComputedOptions,
  type Signal,
} from '@angular/core';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import {
  isGeneratorFunction,
  runCraftGenerator,
} from './craft-generator-runtime';
import { APP_SNAPSHOT_REGISTRY } from './take-app-snapshot';

type CraftComputedGenerator<Yielded, T> = () => Generator<
  Yielded,
  () => T,
  unknown
>;

type TrackedCraftComputed<S, Yielded> = S & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
};

export function craftComputed<Name extends string, T>(
  name: Name,
  computation: () => T,
  options?: CreateComputedOptions<T>,
): Signal<T>;
export function craftComputed<Name extends string, Yielded, T>(
  name: Name,
  factory: CraftComputedGenerator<Yielded, T>,
  options?: CreateComputedOptions<T>,
): TrackedCraftComputed<Signal<T>, Yielded>;
export function craftComputed<T>(
  name: string,
  computationOrFactory: (() => T) | CraftComputedGenerator<unknown, T>,
  options?: CreateComputedOptions<T>,
): Signal<T> {
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
        computationOrFactory as CraftComputedGenerator<unknown, T>
      )();
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
      }).value as () => T;
    });
    result = computed(computationFn, options);
  } else {
    result = computed(computationOrFactory as () => T, options);
  }

  const registry = inject(APP_SNAPSHOT_REGISTRY, { optional: true });
  if (registry) {
    const sig = result;
    const from = computedInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    registry.push(() => {
      let state: unknown;
      try {
        state = sig();
      } catch (error) {
        state = { error: error instanceof Error ? error.message : String(error) };
      }
      return { source: name, from, state };
    });
  }

  return result;
}
