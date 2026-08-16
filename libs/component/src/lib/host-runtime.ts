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
  ɵprovideZonelessChangeDetection,
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
  provideZonelessChangeDetection: typeof ɵprovideZonelessChangeDetection;
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
  CraftAngularDirectiveHost: unknown;
  CraftRoutedComponentHost: unknown;
};

class MissingAngularMount {
  constructor() {
    throw new Error(
      'Import @craft-ng/angular to mount Angular components or directives.',
    );
  }
  update(): void {}
  destroy(): void {}
}

export let computed = ɵcomputed;
export let createEnvironmentInjector = ɵcreateEnvironmentInjector;
export let DestroyRef = CraftDestroyRef;
export let ElementRef = ɵElementRef;
export let EnvironmentInjector = ɵEnvironmentInjector;
export let Injector = CraftInjectorToken;
export let InjectionToken = CraftInjectionToken;
export let inject = ɵinject;
export let provideZonelessChangeDetection = ɵprovideZonelessChangeDetection;
export let reflectComponentType: HostRuntimeApi['reflectComponentType'] = () =>
  null;
export let runInInjectionContext = ɵrunInInjectionContext;
export let signal = ɵsignal;
export let untracked = ɵuntracked;
export let ɵEffectScheduler = CraftEffectScheduler;
export let ɵINJECTOR_SCOPE = CraftInjectorScope;
export let AngularMount: HostRuntimeApi['AngularMount'] =
  MissingAngularMount as unknown as HostRuntimeApi['AngularMount'];
export let CraftAngularDirectiveHost: unknown = class {};
export let CraftRoutedComponentHost: unknown = class {
  constructor() {
    throw new Error(
      'Import @craft-ng/angular to load Craft components on Angular routes.',
    );
  }
};

export function ɵregisterAngularIsland(
  api: Partial<Record<keyof HostRuntimeApi, unknown>>,
): void {
  if (api.computed) computed = api.computed as typeof computed;
  if (api.createEnvironmentInjector)
    createEnvironmentInjector =
      api.createEnvironmentInjector as typeof createEnvironmentInjector;
  if (api.DestroyRef) DestroyRef = api.DestroyRef as typeof DestroyRef;
  if (api.ElementRef) ElementRef = api.ElementRef as typeof ElementRef;
  if (api.EnvironmentInjector)
    EnvironmentInjector = api.EnvironmentInjector as typeof EnvironmentInjector;
  if (api.Injector) Injector = api.Injector as typeof Injector;
  if (api.inject) inject = api.inject as typeof inject;
  if (api.provideZonelessChangeDetection)
    provideZonelessChangeDetection =
      api.provideZonelessChangeDetection as typeof provideZonelessChangeDetection;
  if (api.reflectComponentType)
    reflectComponentType =
      api.reflectComponentType as typeof reflectComponentType;
  if (api.runInInjectionContext)
    runInInjectionContext =
      api.runInInjectionContext as typeof runInInjectionContext;
  if (api.signal) signal = api.signal as typeof signal;
  if (api.untracked) untracked = api.untracked as typeof untracked;
  if (api.ɵEffectScheduler)
    ɵEffectScheduler = api.ɵEffectScheduler as typeof ɵEffectScheduler;
  if (api.ɵINJECTOR_SCOPE)
    ɵINJECTOR_SCOPE = api.ɵINJECTOR_SCOPE as typeof ɵINJECTOR_SCOPE;
  if (api.AngularMount)
    AngularMount = api.AngularMount as typeof AngularMount;
  if (api.CraftAngularDirectiveHost)
    CraftAngularDirectiveHost = api.CraftAngularDirectiveHost;
  if (api.CraftRoutedComponentHost)
    CraftRoutedComponentHost = api.CraftRoutedComponentHost;
}
