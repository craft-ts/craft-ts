import { Observable, type MonoTypeOperatorFunction } from 'rxjs';
import {
  createCraftInjector,
  getCurrentCraftInjector,
  isCraftInjector,
  ɵcreateCraftInjectorFromHost,
  type CraftInjector,
  type CraftInjectToken,
  type CraftProvider,
  type CraftToken,
} from './craft-injector';
import {
  craftComputed,
  craftLinkedSignal,
  craftSignal,
  craftWatch,
  isCraftSignal,
  untracked as craftUntracked,
  type CraftSignal,
  type CraftWritableSignal,
} from './craft-signal';

export type Signal<T> = (() => T) & CraftSignal<T>;
export type WritableSignal<T> = Signal<T> & CraftWritableSignal<T>;
export type Type<T> = new (...args: any[]) => T;
export type AbstractType<T> = abstract new (...args: any[]) => T;
export type ValueEqualityFn<T> = (a: T, b: T) => boolean;

/** Narrow injector shape for option bags that leak into the public type graph. */
export type InjectorHandle = {
  get(token: unknown, notFoundValue?: unknown, flags?: unknown): unknown;
};

export interface Injector {
  get<T>(token: ProviderToken<T>): T;
  get<T>(token: ProviderToken<T>, notFoundValue: null): T | null;
  get<T>(token: ProviderToken<T>, notFoundValue: T): T;
  get<T>(
    token: ProviderToken<T>,
    notFoundValue?: T | null,
    flags?: object,
  ): T | null;
}
export interface EnvironmentInjector extends Injector {
  destroy(): void;
  readonly destroyed: boolean;
}
export type EnvironmentProviders = {
  ɵbrand: 'EnvironmentProviders';
};
export type ValueProvider = {
  provide: object;
  useValue: unknown;
  multi?: boolean;
};
export type FactoryProvider = {
  provide: object;
  useFactory: (...args: any[]) => unknown;
  deps?: unknown[];
  multi?: boolean;
};
export type ClassProvider = {
  provide: object;
  useClass: Type<unknown>;
  deps?: unknown[];
  multi?: boolean;
};
export type ExistingProvider = {
  provide: object;
  useExisting: object;
  multi?: boolean;
};
export type TypeProvider = Type<unknown>;
export type AngularStyleProvider =
  | TypeProvider
  | ValueProvider
  | FactoryProvider
  | ClassProvider
  | ExistingProvider
  | EnvironmentProviders
  | any[];
export type Provider = AngularStyleProvider;
export type ApplicationConfig = {
  providers: Array<Provider | EnvironmentProviders>;
};

export type ResourceStatus =
  | 'idle'
  | 'error'
  | 'loading'
  | 'reloading'
  | 'resolved'
  | 'local';
export type ResourceSnapshot<T> = {
  value: T;
  status: ResourceStatus;
};
export type ResourceRef<T = unknown> = {
  value: Signal<T | undefined>;
  status: Signal<ResourceStatus>;
  isLoading: Signal<boolean>;
  hasValue(): boolean;
  reload(): boolean;
  destroy(): void;
  set(value: T): void;
  update(updateFn: (value: T) => T): void;
  asReadonly(): ResourceRef<T>;
};
export type ResourceLoaderParams<P> = {
  params: NoInfer<P>;
  abortSignal: AbortSignal;
  previous: {
    status: ResourceStatus;
    value?: unknown;
  };
};
export type ResourceOptions<T, P> = {
  params?: () => P;
  loader?: (params: ResourceLoaderParams<P>) => Promise<T> | T;
  stream?: ResourceStreamingLoader<T, P>;
  defaultValue?: T;
  injector?: InjectorHandle;
  equal?: ValueEqualityFn<T>;
};
export type ResourceStreamItem<T> = { value: T } | { error: Error };
export type ResourceStreamingLoader<T, P> = (
  params: ResourceLoaderParams<P>,
) =>
  | Promise<Signal<ResourceStreamItem<T> | { value: T } | undefined>>
  | Observable<{ value: T } | ResourceStreamItem<T>>
  | Signal<{ value: T } | ResourceStreamItem<T> | undefined>;
export type InputSignal<T> = Signal<T>;
export type InputSignalWithTransform<T, TransformT = unknown> = Signal<T> & {
  readonly transform?: (value: TransformT) => T;
};
export type CreateComputedOptions<T> = {
  equal?: ValueEqualityFn<T>;
  debugName?: string;
};
export type CreateEffectOptions = {
  injector?: InjectorHandle | object;
  manualCleanup?: boolean;
  debugName?: string;
};

export type ProviderToken<T> =
  | InjectionToken<T>
  | CraftToken<T>
  | Type<T>
  | AbstractType<T>
  | CraftInjectToken<T>;
export type EffectCleanupRegisterFn = (cleanup: () => void) => void;
export type EffectRef = { destroy(): void };

const rootDefaultProviders: Provider[] = [];

export class InjectionToken<T> {
  readonly debugName: string;
  readonly ɵfactory?: () => T;
  constructor(
    description: string,
    options?: {
      providedIn?: 'root' | 'platform' | 'any' | null;
      factory?: () => T;
      multi?: boolean;
    },
  ) {
    this.debugName = description;
    if (options?.factory) {
      let hasValue = false;
      let value!: T;
      this.ɵfactory = () => {
        if (!hasValue) {
          value = options.factory!();
          hasValue = true;
        }
        return value;
      };
      if (
        !options.multi &&
        (options.providedIn === 'root' || options.providedIn === undefined)
      ) {
        rootDefaultProviders.push({
          provide: this,
          useFactory: () => this.ɵfactory!(),
        });
      }
    }
  }
}

export function getCraftRootDefaultProviders(): Provider[] {
  return rootDefaultProviders;
}

type DestroyRefState = {
  callbacks: Array<() => void>;
  closed: boolean;
};
const destroyRefState = new WeakMap<DestroyRef, DestroyRefState>();

function getDestroyRefState(ref: DestroyRef): DestroyRefState {
  let state = destroyRefState.get(ref);
  if (!state) {
    state = { callbacks: [], closed: false };
    destroyRefState.set(ref, state);
  }
  return state;
}

export class DestroyRef {
  onDestroy(callback: () => void): () => void {
    const state = getDestroyRefState(this);
    if (state.closed) {
      callback();
      return () => undefined;
    }
    state.callbacks.push(callback);
    return () => {
      const index = state.callbacks.indexOf(callback);
      if (index >= 0) {
        state.callbacks.splice(index, 1);
      }
    };
  }
}

export function ɵdestroyCraftDestroyRef(ref: DestroyRef): void {
  const state = getDestroyRefState(ref);
  if (state.closed) {
    return;
  }
  state.closed = true;
  for (const callback of [...state.callbacks]) {
    callback();
  }
  state.callbacks.length = 0;
}

const INJECTOR_TOKEN = new InjectionToken<CraftInjector>('Injector');
const ENVIRONMENT_INJECTOR_TOKEN = new InjectionToken<CraftInjector>(
  'EnvironmentInjector',
);

export const Injector = Object.assign(INJECTOR_TOKEN, {
  NULL: createCraftInjector([]),
  create(options: {
    providers: readonly unknown[];
    parent?: Injector | CraftInjector | object | null;
    name?: string;
  }): CraftInjector {
    const parent = options.parent ?? createCraftInjector([]);
    return createEnvironmentInjector(
      options.providers,
      parent as CraftInjector | Injector,
      options.name,
    );
  },
});

export const EnvironmentInjector = ENVIRONMENT_INJECTOR_TOKEN;

export const DOCUMENT = new InjectionToken<Document>('DOCUMENT', {
  factory: () => globalThis.document,
});

export const LOCALE_ID = new InjectionToken<string>('LOCALE_ID', {
  factory: () => 'en-US',
});

export const APP_INITIALIZER = new InjectionToken<Array<() => unknown>>(
  'APP_INITIALIZER',
  { factory: () => [], multi: true },
);

export class ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);
  }
}

let craftDevMode: boolean | undefined;

export function ɵsetCraftDevMode(isDev: boolean | undefined): void {
  craftDevMode = isDev;
}

export function isDevMode(): boolean {
  if (craftDevMode !== undefined) {
    return craftDevMode;
  }
  const ngDevMode = (globalThis as { ngDevMode?: boolean }).ngDevMode;
  if (typeof ngDevMode === 'boolean') {
    return ngDevMode;
  }
  const nodeProcess = (
    globalThis as { process?: { env?: { NODE_ENV?: string } } }
  ).process;
  return (
    typeof nodeProcess === 'undefined' ||
    nodeProcess.env?.NODE_ENV !== 'production'
  );
}

export class ElementRef<T = HTMLElement> {
  nativeElement: T;
  constructor(nativeElement: T) {
    this.nativeElement = nativeElement;
  }
}

export class Renderer2 {
  createElement(name: string): Element {
    return globalThis.document.createElement(name);
  }
  setProperty(el: object, name: string, value: unknown): void {
    (el as Record<string, unknown>)[name] = value;
  }
  listen(
    target: EventTarget,
    event: string,
    handler: EventListener,
  ): () => void {
    target.addEventListener(event, handler);
    return () => target.removeEventListener(event, handler);
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();
  emit(value: T): void {
    for (const listener of this.listeners) {
      listener(value);
    }
  }
  subscribe(next: ((value: T) => void) | { next?: (value: T) => void }): {
    unsubscribe(): void;
  } {
    const listener = typeof next === 'function' ? next : (next.next ?? (() => undefined));
    this.listeners.add(listener);
    return {
      unsubscribe: () => {
        this.listeners.delete(listener);
      },
    };
  }
}

function isInjectorToken(token: unknown): boolean {
  return token === Injector || token === EnvironmentInjector || token === INJECTOR_TOKEN;
}

function isDestroyRefToken(token: unknown): boolean {
  return token === DestroyRef;
}

type CraftInjectFallback = (
  token: object,
  options?: { optional?: boolean; skipSelf?: boolean },
) => unknown;

let injectFallback: CraftInjectFallback | undefined;

export function ɵsetCraftInjectFallback(
  fallback: CraftInjectFallback | undefined,
): void {
  injectFallback = fallback;
}

export function inject<T>(token: InjectionToken<T>): T;
export function inject<T>(token: CraftToken<T>): T;
export function inject<T>(token: Type<T>): T;
export function inject<T>(token: AbstractType<T>): T;
export function inject<T>(token: ProviderToken<T>): T;
export function inject<T>(
  token: ProviderToken<T>,
  options: { optional?: false; skipSelf?: boolean },
): T;
export function inject<T>(
  token: ProviderToken<T>,
  options: { optional: true; skipSelf?: boolean },
): T | null;
export function inject<T>(
  token: ProviderToken<T>,
  options?: { optional?: boolean; skipSelf?: boolean },
): T | null {
  let injector: CraftInjector;
  try {
    injector = getCurrentCraftInjector();
  } catch (error) {
    if (injectFallback) {
      return injectFallback(token as object, options) as T;
    }
    throw error;
  }
  if (options?.skipSelf) {
    const parent = injector.ɵparent;
    if (!parent) {
      if (options.optional) {
        return null;
      }
      throw new Error(`No provider for Craft token "${String(token)}".`);
    }
    injector = parent;
  }
  if (isInjectorToken(token)) {
    return injector as T;
  }
  if (isDestroyRefToken(token)) {
    const fromInjector = injector.getOptional(DestroyRef);
    if (fromInjector) {
      return fromInjector as T;
    }
    const attached = (
      injector as CraftInjector & { ɵdestroyRef?: DestroyRef }
    ).ɵdestroyRef;
    if (attached) {
      return attached as T;
    }
    if (options?.optional) {
      return null;
    }
    throw new Error('No provider for Craft token "DestroyRef".');
  }
  if (options?.optional) {
    return injector.getOptional(token as object) as T | null;
  }
  return injector.get(token as object) as T;
}

export function assertInInjectionContext(_fn?: (...args: never[]) => unknown): void {
  inject(Injector);
}

export function runInInjectionContext<T>(
  injector: Injector | CraftInjector | object,
  fn: () => T,
): T {
  return asCraftInjector(injector).run(fn);
}

type CraftHostInjectorRunner = <T>(host: object, fn: () => T) => T;

let hostInjectorRunner: CraftHostInjectorRunner | undefined;

export function ɵsetCraftHostInjectorRunner(
  runner: CraftHostInjectorRunner | undefined,
): void {
  hostInjectorRunner = runner;
}

export function asCraftInjector(
  injector: Injector | CraftInjector | object,
): CraftInjector {
  if (isCraftInjector(injector)) {
    return injector;
  }
  return ɵcreateCraftInjectorFromHost(injector as object, (fn) =>
    hostInjectorRunner
      ? hostInjectorRunner(injector as object, fn)
      : fn(),
  );
}

export function ɵcraftInjectorFromHost(hostInjector: object): CraftInjector {
  return asCraftInjector(hostInjector);
}

function flattenProviders(providers: readonly unknown[]): Array<{
  provide: object;
  useValue?: unknown;
  useFactory?: (...args: any[]) => unknown;
  useExisting?: object;
  useClass?: Type<unknown>;
  deps?: unknown[];
  multi?: boolean;
}> {
  const flattened: Array<{
    provide: object;
    useValue?: unknown;
    useFactory?: (...args: any[]) => unknown;
    useExisting?: object;
    useClass?: Type<unknown>;
    deps?: unknown[];
    multi?: boolean;
  }> = [];
  for (const provider of providers) {
    if (Array.isArray(provider)) {
      flattened.push(...flattenProviders(provider));
      continue;
    }
    if (
      typeof provider === 'object' &&
      provider !== null &&
      'ɵproviders' in provider &&
      Array.isArray((provider as { ɵproviders?: unknown[] }).ɵproviders)
    ) {
      flattened.push(
        ...flattenProviders((provider as { ɵproviders: unknown[] }).ɵproviders),
      );
      continue;
    }
    if (
      typeof provider === 'object' &&
      provider !== null &&
      'provide' in provider
    ) {
      flattened.push(
        provider as {
          provide: object;
          useValue?: unknown;
          useFactory?: (...args: any[]) => unknown;
          useExisting?: object;
          useClass?: Type<unknown>;
          deps?: unknown[];
          multi?: boolean;
        },
      );
    }
  }
  return flattened;
}

export function toCraftProviders(
  providers: readonly unknown[],
): CraftProvider[] {
  return flattenProviders(providers).map((provider) => {
    const token = provider.provide;
    const multi = provider.multi === true;
    if ('useValue' in provider) {
      return { token, useValue: provider.useValue, multi };
    }
    if (provider.useExisting) {
      const existing = provider.useExisting;
      return {
        token,
        multi,
        useFactory: (injector) => injector.get(existing),
      };
    }
    if (provider.useClass) {
      const type = provider.useClass;
      return {
        token,
        multi,
        useFactory: (injector) => injector.run(() => new (type as new () => unknown)()),
      };
    }
    const factory = provider.useFactory ?? (() => undefined);
    const deps = provider.deps ?? [];
    return {
      token,
      multi,
      useFactory: (injector) =>
        injector.run(() =>
          factory(...deps.map((dep) => injector.get(dep as object))),
        ),
    };
  });
}

export function createEnvironmentInjector(
  providers: readonly unknown[],
  parent: Injector | CraftInjector,
  _debugName?: string,
): EnvironmentInjector & CraftInjector {
  const destroyRef = new DestroyRef();
  const parentCraft = asCraftInjector(parent);
  const child = parentCraft.createChild([
    { token: DestroyRef, useValue: destroyRef },
    { token: INJECTOR_TOKEN, useFactory: (injector) => injector },
    { token: ENVIRONMENT_INJECTOR_TOKEN, useFactory: (injector) => injector },
    ...toCraftProviders(providers),
  ]);
  Object.assign(child, { ɵdestroyRef: destroyRef });
  (
    child as CraftInjector & { ɵonDestroy?: (callback: () => void) => void }
  ).ɵonDestroy?.(() => ɵdestroyCraftDestroyRef(destroyRef));
  return child;
}

export function provideAppInitializer(fn: () => unknown): Provider {
  return { provide: APP_INITIALIZER, useValue: fn, multi: true };
}

export function provideZonelessChangeDetection(): Provider {
  return { provide: new InjectionToken('Zoneless'), useValue: true };
}

export const ɵINJECTOR_SCOPE = new InjectionToken<string>('INJECTOR_SCOPE', {
  factory: () => 'root',
});

export const ɵEffectScheduler = new InjectionToken<{ flush(): void }>(
  'EffectScheduler',
  {
    factory: () => ({
      flush(): void {
        // alien-signals flushes synchronously.
      },
    }),
  },
);

export function signal<T>(
  initial: T,
  options?: { equal?: ValueEqualityFn<T>; debugName?: string },
): CraftWritableSignal<T> {
  return craftSignal(initial, options);
}

export function computed<T>(
  compute: () => T,
  options?: CreateComputedOptions<T>,
): CraftSignal<T> {
  return options ? craftComputed(compute, options) : craftComputed(compute);
}

type LinkedPrevious<Source, T> = {
  source: Source;
  value: T;
};

export function linkedSignal<T>(source: () => T): CraftWritableSignal<T>;
export function linkedSignal<T>(
  source: () => T,
  options: { equal?: ValueEqualityFn<T>; debugName?: string },
): CraftWritableSignal<T>;
export function linkedSignal<Source, T>(options: {
  source: () => Source;
  computation: (
    source: Source,
    previous?: LinkedPrevious<Source, T>,
  ) => T;
  equal?: ValueEqualityFn<T>;
  debugName?: string;
  injector?: InjectorHandle;
}): CraftWritableSignal<T>;
export function linkedSignal<T>(
  sourceOrOptions:
    | (() => T)
    | {
        source: () => unknown;
        computation: (
          source: unknown,
          previous?: LinkedPrevious<unknown, T>,
        ) => T;
        equal?: ValueEqualityFn<T>;
        debugName?: string;
        injector?: InjectorHandle;
      },
  options?: { equal?: ValueEqualityFn<T>; debugName?: string },
): CraftWritableSignal<T> {
  if (typeof sourceOrOptions === 'function') {
    return craftLinkedSignal({
      source: sourceOrOptions,
      computation: sourceOrOptions,
      equal: options?.equal,
      debugName: options?.debugName,
    });
  }
  let previous: LinkedPrevious<unknown, T> | undefined;
  return craftLinkedSignal({
    source: sourceOrOptions.source,
    computation: () => {
      const source = sourceOrOptions.source();
      const value = sourceOrOptions.computation(source, previous);
      previous = { source, value };
      return value;
    },
    equal: sourceOrOptions.equal,
    debugName: sourceOrOptions.debugName,
  });
}

function bindWatchToDestroyRef(
  watch: { destroy(): void },
  options?: CreateEffectOptions,
): void {
  if (options?.manualCleanup) {
    return;
  }
  let destroyRef: DestroyRef | null = null;
  try {
    destroyRef = inject(DestroyRef, { optional: true });
  } catch {
    destroyRef = null;
  }
  destroyRef?.onDestroy(() => watch.destroy());
}

export function effect(
  fn: (onCleanup: EffectCleanupRegisterFn) => void,
  options?: CreateEffectOptions,
): EffectRef {
  const run = () => {
    const watch = craftWatch(() => {
      const cleanups: Array<() => void> = [];
      fn((cleanup) => {
        cleanups.push(cleanup);
      });
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    }, options);
    bindWatchToDestroyRef(watch, options);
    return watch;
  };
  const injector = options?.injector;
  return injector ? asCraftInjector(injector).run(run) : run();
}

export function untracked<T>(fn: () => T): T {
  return craftUntracked(fn);
}

function isAngularSignalLike(value: unknown): boolean {
  if (typeof value !== 'function') {
    return false;
  }
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.some((symbol) => symbol.description === 'SIGNAL')) {
    return true;
  }
  return 'set' in value || 'update' in value;
}

export function isSignal(value: unknown): value is Signal<unknown> {
  return isCraftSignal(value) || isAngularSignalLike(value);
}

export function isWritableSignal(
  value: unknown,
): value is WritableSignal<unknown> {
  return isSignal(value) && typeof (value as { set?: unknown }).set === 'function';
}

export function takeUntilDestroyed<T>(
  destroyRef?: DestroyRef,
): MonoTypeOperatorFunction<T> {
  const ref = destroyRef ?? inject(DestroyRef, { optional: true });
  return (source) =>
    new Observable<T>((subscriber) => {
      const subscription = source.subscribe(subscriber);
      const release = ref?.onDestroy(() => subscription.unsubscribe());
      return () => {
        release?.();
        subscription.unsubscribe();
      };
    });
}

export type ToObservableOptions = {
  injector?: InjectorHandle;
};

export function toObservable<T>(
  source: Signal<T>,
  options?: ToObservableOptions,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    const start = () => {
      const watch = craftWatch(() => {
        subscriber.next(source());
      });
      let release: (() => void) | undefined;
      try {
        const destroyRef = inject(DestroyRef, { optional: true });
        release = destroyRef?.onDestroy(() => {
          watch.destroy();
          if (!subscriber.closed) {
            subscriber.complete();
          }
        });
      } catch {
        release = undefined;
      }
      return () => {
        release?.();
        watch.destroy();
      };
    };
    return options?.injector
      ? asCraftInjector(options.injector).run(start)
      : start();
  });
}
