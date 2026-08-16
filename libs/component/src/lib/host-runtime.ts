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
  ɵInjectionToken as CraftInjectionToken,
  ɵrunInInjectionContext,
  ɵsignal,
  ɵuntracked,
  type CraftInjector,
  type ɵEffectRef,
  type ɵProvider,
  type ɵProviderToken,
} from '@craft-ng/core';

export type EffectRef = ɵEffectRef;
export type Provider = ɵProvider;
export type ProviderToken<T> = ɵProviderToken<T>;
export type DestroyRef = InstanceType<typeof CraftDestroyRef>;
export type Injector = CraftInjector;
export type EnvironmentInjector = CraftInjector;
export type ElementRef<T = HTMLElement> = InstanceType<typeof ɵElementRef> & {
  nativeElement: T;
};

type HostRuntimeApi = {
  computed: typeof ɵcomputed;
  createEnvironmentInjector: typeof ɵcreateEnvironmentInjector;
  DestroyRef: typeof CraftDestroyRef;
  ElementRef: typeof ɵElementRef;
  EnvironmentInjector: typeof ɵEnvironmentInjector;
  Injector: typeof CraftInjectorToken;
  inject: typeof ɵinject;
  reflectComponentType: (
    component: unknown,
  ) => { selector?: string | null } | null;
  runInInjectionContext: typeof ɵrunInInjectionContext;
  signal: typeof ɵsignal;
  untracked: typeof ɵuntracked;
  ɵEffectScheduler: typeof CraftEffectScheduler;
  ɵINJECTOR_SCOPE: typeof CraftInjectorScope;
  AngularMount: new (
    component: unknown,
    hostElement: Element,
    injector: unknown,
    inputs: Readonly<Record<string, unknown>>,
    outputs: Readonly<Record<string, (value: unknown) => unknown>>,
    directives: readonly unknown[],
    context: {
      injector: unknown;
      resolveInput: (value: unknown) => unknown;
      executeOutput: (
        callback: (value: unknown) => unknown,
        value: unknown,
      ) => unknown;
    },
  ) => { update(...args: unknown[]): void; destroy(): void };
};

export const computed = ɵcomputed;
export const createEnvironmentInjector = ɵcreateEnvironmentInjector;
export const DestroyRef = CraftDestroyRef;
export const ElementRef = ɵElementRef;
export const EnvironmentInjector = ɵEnvironmentInjector;
export const Injector = CraftInjectorToken;
export const InjectionToken = CraftInjectionToken;
export const inject = ɵinject;
export const reflectComponentType: HostRuntimeApi['reflectComponentType'] = () =>
  null;
export const runInInjectionContext = ɵrunInInjectionContext;
export const signal = ɵsignal;
export const untracked = ɵuntracked;
export const ɵEffectScheduler = CraftEffectScheduler;
export const ɵINJECTOR_SCOPE = CraftInjectorScope;

