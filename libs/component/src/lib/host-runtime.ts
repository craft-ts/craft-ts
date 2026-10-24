import {
  ɵDestroyRef as CraftDestroyRef,
  ɵInjector as CraftInjectorToken,
  ɵcomputed,
  ɵcreateEnvironmentInjector,
  ɵEffectScheduler as CraftEffectScheduler,
  ɵElementRef,
  ɵEnvironmentInjector,
  ɵINJECTOR_SCOPE as CraftInjectorScope,
  ɵinject,
  ɵrunInInjectionContext,
  ɵsignal,
  ɵuntracked,
  type CraftInjector,
  type ɵEffectRef,
  type ɵProvider,
} from '@craft-ts/core';

export type EffectRef = ɵEffectRef;
export type Provider = ɵProvider;
export type DestroyRef = InstanceType<typeof CraftDestroyRef>;
export type Injector = CraftInjector;
export type EnvironmentInjector = CraftInjector;
export type ElementRef<T = HTMLElement> = InstanceType<typeof ɵElementRef> & {
  nativeElement: T;
};

export const computed = ɵcomputed;
export const createEnvironmentInjector = ɵcreateEnvironmentInjector;
export const DestroyRef = CraftDestroyRef;
export const ElementRef = ɵElementRef;
export const EnvironmentInjector: typeof ɵEnvironmentInjector =
  ɵEnvironmentInjector;
export const Injector: typeof CraftInjectorToken = CraftInjectorToken;
export const inject = ɵinject;
export const runInInjectionContext = ɵrunInInjectionContext;
export const signal = ɵsignal;
export const untracked = ɵuntracked;
export const ɵEffectScheduler: typeof CraftEffectScheduler =
  CraftEffectScheduler;
export const ɵINJECTOR_SCOPE: typeof CraftInjectorScope = CraftInjectorScope;
