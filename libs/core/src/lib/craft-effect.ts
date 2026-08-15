import {
  assertInInjectionContext,
  DestroyRef,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
  type CreateEffectOptions,
  type EffectCleanupRegisterFn,
  type EffectRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { craftWatch } from './host/craft-signal';
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

type CraftEffectFn = (onCleanup: EffectCleanupRegisterFn) => void;

type CraftEffectGenerator<This, Yielded> = (
  this: This,
) => Generator<Yielded, CraftEffectFn, unknown>;

type TrackedCraftEffect<E, Yielded> = E & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
};

// Host-bound forms — `craftEffect('name', this, function* () { ... })` — bind
// `this` inside the factory (and the effect body it returns) to the given host,
// so a class-field initializer can read instance state (mirrors `craftMethod`).
// Without a host, a `function*` factory is called with `this = undefined`.
// The generator overloads must come first: a generator function is also
// assignable to `CraftEffectFn` (a `void` return accepts anything), so the
// plain overload would otherwise win and drop the dependency metadata.
export function craftEffect<Name extends string, This, Yielded>(
  name: Name,
  host: This,
  factory: CraftEffectGenerator<This, Yielded>,
  options?: CreateEffectOptions,
): TrackedCraftEffect<EffectRef, Yielded>;
export function craftEffect<Name extends string, Yielded>(
  name: Name,
  factory: CraftEffectGenerator<void, Yielded>,
  options?: CreateEffectOptions,
): TrackedCraftEffect<EffectRef, Yielded>;
export function craftEffect<Name extends string, This>(
  name: Name,
  host: This,
  effectFn: (this: This, onCleanup: EffectCleanupRegisterFn) => void,
  options?: CreateEffectOptions,
): EffectRef;
export function craftEffect<Name extends string>(
  name: Name,
  effectFn: CraftEffectFn,
  options?: CreateEffectOptions,
): EffectRef;
export function craftEffect(
  name: string,
  hostOrFn: unknown,
  fnOrOptions?: unknown,
  maybeOptions?: CreateEffectOptions,
): EffectRef {
  // The host form is recognized by its 3rd argument being the factory —
  // `options` is never a function.
  const hasHost = typeof fnOrOptions === 'function';
  const host = hasHost ? hostOrFn : undefined;
  const fnOrFactory = (hasHost ? fnOrOptions : hostOrFn) as
    | ((this: unknown, onCleanup: EffectCleanupRegisterFn) => void)
    | CraftEffectGenerator<unknown, unknown>;
  const options = (hasHost ? maybeOptions : fnOrOptions) as
    | CreateEffectOptions
    | undefined;

  assertInInjectionContext(craftEffect);
  const parentInjector = inject(Injector);
  const ownerInjector = options?.injector ?? parentInjector;
  const ownerDestroyRef = ownerInjector.get(DestroyRef);
  const effectInjector = ɵcreateHostTaggedInjector(
    ownerInjector,
    `effect:${name}`,
  );

  let effectBody: CraftEffectFn;

  if (isGeneratorFunction(fnOrFactory)) {
    effectBody = runInInjectionContext(effectInjector, () => {
      const iterator = (
        fnOrFactory as CraftEffectGenerator<unknown, unknown>
      ).call(host);
      return runCraftGenerator({
        iterator,
        injector: effectInjector,
        hostScope: 'function',
        invalidYieldErrorMessage:
          'craftEffect generators can only yield craftService dependencies.',
        multipleAppStartErrorMessage:
          'craftEffect generators cannot declare onAppStart(...) more than once.',
        onAppStartNotSupportedErrorMessage:
          'craftEffect(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
      }).value as CraftEffectFn;
    });
  } else {
    const plainFn = fnOrFactory as (
      this: unknown,
      onCleanup: EffectCleanupRegisterFn,
    ) => void;
    effectBody = hasHost
      ? (onCleanup) => plainFn.call(host, onCleanup)
      : (plainFn as CraftEffectFn);
  }

  const craftInvalidation = signal(0);
  let craftRef: { destroy(): void } | undefined;
  let destroyed = false;
  const angularRef = effect(
    () => {
      craftInvalidation();
      craftRef?.destroy();
      let initialRun = true;
      craftRef = craftWatch(() => {
        if (initialRun) {
          const cleanups: (() => void)[] = [];
          effectBody((cleanup) => cleanups.push(cleanup));
          return cleanups.length === 0
            ? undefined
            : () => {
                for (const cleanup of cleanups) cleanup();
              };
        }
        untracked(() => craftInvalidation.update((revision) => revision + 1));
        return undefined;
      });
      initialRun = false;
    },
    {
      ...options,
      injector: ownerInjector,
      manualCleanup: true,
    },
  );
  const ref = {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      angularRef.destroy();
      craftRef?.destroy();
    },
  } as EffectRef;
  if (!options?.manualCleanup) {
    ownerDestroyRef.onDestroy(() => ref.destroy());
  }

  const registry = ownerInjector.get(APP_SNAPSHOT_REGISTRY, null);
  if (registry) {
    const from = effectInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    registry.triggerSnapshot$
      .pipe(takeUntilDestroyed(ownerDestroyRef))
      .subscribe(() => {
        registry.allActiveEffects$.next({
          source: `effect:${name}`,
          from,
        });
      });
  }

  return ref;
}
