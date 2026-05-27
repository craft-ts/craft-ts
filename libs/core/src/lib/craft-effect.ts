import {
  assertInInjectionContext,
  DestroyRef,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  type CreateEffectOptions,
  type EffectCleanupRegisterFn,
  type EffectRef,
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
import { APP_SNAPSHOT_REGISTRY } from './take-app-snapshot';

type CraftEffectFn = (onCleanup: EffectCleanupRegisterFn) => void;

type CraftEffectGenerator<Yielded> = () => Generator<
  Yielded,
  CraftEffectFn,
  unknown
>;

type TrackedCraftEffect<E, Yielded> = E & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
};

export function craftEffect<Name extends string>(
  name: Name,
  effectFn: CraftEffectFn,
  options?: CreateEffectOptions,
): EffectRef;
export function craftEffect<Name extends string, Yielded>(
  name: Name,
  factory: CraftEffectGenerator<Yielded>,
  options?: CreateEffectOptions,
): TrackedCraftEffect<EffectRef, Yielded>;
export function craftEffect(
  name: string,
  fnOrFactory: CraftEffectFn | CraftEffectGenerator<unknown>,
  options?: CreateEffectOptions,
): EffectRef {
  assertInInjectionContext(craftEffect);
  const parentInjector = inject(Injector);
  const parentDestroyRef = inject(DestroyRef);
  const effectInjector = ɵcreateHostTaggedInjector(
    parentInjector,
    `effect:${name}`,
  );

  let effectBody: CraftEffectFn;

  if (isGeneratorFunction(fnOrFactory)) {
    effectBody = runInInjectionContext(effectInjector, () => {
      const iterator = (fnOrFactory as CraftEffectGenerator<unknown>)();
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
    effectBody = fnOrFactory as CraftEffectFn;
  }

  const ref = effect(effectBody, {
    ...options,
    injector: parentInjector,
    manualCleanup: options?.manualCleanup,
  });

  const registry = inject(APP_SNAPSHOT_REGISTRY, { optional: true });
  if (registry) {
    const from = effectInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    registry.triggerSnapshot$
      .pipe(takeUntilDestroyed(parentDestroyRef))
      .subscribe(() => {
        registry.allActiveEffects$.next({
          source: `effect:${name}`,
          from,
        });
      });
  }

  return ref;
}
