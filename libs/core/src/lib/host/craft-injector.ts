export type CraftProvider<T = unknown> =
  | { token: object; useValue: T; multi?: boolean; collection?: boolean }
  | {
      token: object;
      useFactory: (injector: CraftInjector) => T;
      multi?: boolean;
      collection?: boolean;
    };

export type CraftInjectToken<T> =
  | object
  | (abstract new (...args: never[]) => T)
  | {
      readonly debugName?: string;
      readonly ɵfactory?: () => T;
    };

export interface CraftInjector {
  get<T>(token: CraftInjectToken<T>): T;
  get<T>(token: CraftInjectToken<T>, notFoundValue: null): T | null;
  get<T>(token: CraftInjectToken<T>, notFoundValue: T): T;
  get<T>(
    token: CraftInjectToken<T>,
    notFoundValue: T | null,
    flags?: object,
  ): T | null;
  getOptional<T>(token: CraftInjectToken<T> | object): T | null;
  run<T>(fn: () => T): T;
  createChild(providers: readonly CraftProvider[]): CraftInjector;
  destroy(): void;
  readonly destroyed: boolean;
  readonly ɵparent?: CraftInjector | null;
}

type ProviderRecord = {
  resolve(): unknown;
  readonly collection: boolean;
};

type TokenWithFactory = {
  readonly debugName?: string;
  readonly ɵfactory?: () => unknown;
};

type NodeProcess = {
  getBuiltinModule?: (specifier: string) => unknown;
  versions?: { node?: string };
};

type AsyncLocalStorageLike<T> = {
  getStore(): T | undefined;
  run<Result>(store: T, callback: () => Result): Result;
};

type AsyncLocalStorageConstructor = new <T>() => AsyncLocalStorageLike<T>;
export type CraftHostContextRunner = <T>(fn: () => T) => T;

const nodeProcess = (
  globalThis as typeof globalThis & { process?: NodeProcess }
).process;
const AsyncLocalStorage = nodeProcess?.versions?.node
  ? (
      nodeProcess.getBuiltinModule?.('node:async_hooks') as
        | { AsyncLocalStorage?: AsyncLocalStorageConstructor }
        | undefined
    )?.AsyncLocalStorage
  : undefined;
const injectorStorage = AsyncLocalStorage
  ? new AsyncLocalStorage<CraftInjector>()
  : null;
const browserInjectorStack: CraftInjector[] = [];
const hostInjectors = new WeakMap<object, CraftInjector>();
export const ɵNOT_FOUND = Symbol('CraftInjector.notFound');

/** A provider factory requested the same provider while it was resolving. */
export class CraftCircularDependencyError extends Error {
  readonly dependencyPath: readonly string[];

  constructor(dependencyPath: readonly string[]) {
    super(
      `Circular Craft provider dependency detected: ${dependencyPath.join(' → ')}`,
    );
    this.name = 'CraftCircularDependencyError';
    this.dependencyPath = dependencyPath;
  }
}

type ActiveProviderResolution = {
  record: ProviderRecord;
  token: object;
};

const activeProviderResolutions: ActiveProviderResolution[] = [];

export function createCraftInjector(
  providers: readonly CraftProvider[],
): CraftInjector {
  return createNativeCraftInjector(providers, null);
}

export function getCurrentCraftInjector(): CraftInjector {
  const injector =
    injectorStorage?.getStore() ??
    browserInjectorStack[browserInjectorStack.length - 1];
  if (!injector) {
    throw new Error(
      'getCurrentCraftInjector() must be called inside an injection context (injector.run()).',
    );
  }
  return injector;
}

export function isCraftInjector(value: unknown): value is CraftInjector {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CraftInjector).get === 'function' &&
    typeof (value as CraftInjector).run === 'function' &&
    typeof (value as CraftInjector).createChild === 'function'
  );
}

function tokenName(token: object): string {
  const named = token as TokenWithFactory & { name?: string };
  return named.debugName ?? named.name ?? 'unknown';
}

function readDefaultFactory(token: object): unknown | typeof ɵNOT_FOUND {
  const factory = (token as TokenWithFactory).ɵfactory;
  if (typeof factory !== 'function') {
    return ɵNOT_FOUND;
  }
  return factory();
}

function lookupRecord(
  records: Map<object, ProviderRecord>,
  token: object,
): ProviderRecord | undefined {
  return records.get(token);
}

function lookupDefaultFactory(token: object): unknown | typeof ɵNOT_FOUND {
  return readDefaultFactory(token);
}

function createNativeCraftInjector(
  providers: readonly CraftProvider[],
  parent: CraftInjector | null,
): CraftInjector {
  const records = new Map<object, ProviderRecord>();
  const defaultValues = new Map<object, unknown>();
  const children: CraftInjector[] = [];
  let destroyed = false;
  const resolveDefault = (token: object): unknown | typeof ɵNOT_FOUND => {
    if (defaultValues.has(token)) return defaultValues.get(token);
    const value = lookupDefaultFactory(token);
    if (value !== ɵNOT_FOUND) defaultValues.set(token, value);
    return value;
  };
  const destroyCallbacks: Array<() => void> = [];
  const craftInjector: CraftInjector = {
    get<T>(token: object, notFoundValue?: T): T {
      if (token === craftInjector) {
        return craftInjector as T;
      }
      const local = lookupRecord(records, token);
      if (local) {
        const value = local.resolve();
        if (local.collection) {
          const parentValues = parent
            ? ((parent.getOptional(token) as unknown[] | null) ?? [])
            : [];
          return [
            ...(Array.isArray(parentValues) ? parentValues : []),
            ...(value as unknown[]),
          ] as T;
        }
        return value as T;
      }
      if (parent) {
        if (arguments.length >= 2) {
          return parent.get(token, notFoundValue as T);
        }
        try {
          return parent.get(token);
        } catch {
          const fallback = resolveDefault(token);
          if (fallback !== ɵNOT_FOUND) {
            return fallback as T;
          }
          throw missingProviderError(token);
        }
      }
      const fallback = resolveDefault(token);
      if (fallback !== ɵNOT_FOUND) {
        return fallback as T;
      }
      if (arguments.length >= 2) {
        return notFoundValue as T;
      }
      throw missingProviderError(token);
    },
    getOptional<T>(token: object): T | null {
      if (token === craftInjector) {
        return craftInjector as T;
      }
      const local = lookupRecord(records, token);
      if (local) {
        const value = local.resolve();
        if (local.collection) {
          const parentValues = parent
            ? ((parent.getOptional(token) as unknown[] | null) ?? [])
            : [];
          return [
            ...(Array.isArray(parentValues) ? parentValues : []),
            ...(value as unknown[]),
          ] as T;
        }
        return value as T;
      }
      if (parent) {
        const inherited = parent.getOptional(token);
        if (inherited !== null) {
          return inherited as T;
        }
      }
      const fallback = resolveDefault(token);
      return fallback === ɵNOT_FOUND ? null : (fallback as T);
    },
    run<T>(fn: () => T): T {
      if (injectorStorage) {
        return injectorStorage.run(craftInjector, fn);
      }
      browserInjectorStack.push(craftInjector);
      try {
        return fn();
      } finally {
        browserInjectorStack.pop();
      }
    },
    createChild(childProviders: readonly CraftProvider[]): CraftInjector {
      const child = createNativeCraftInjector(childProviders, craftInjector);
      children.push(child);
      return child;
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const child of children) {
        child.destroy();
      }
      for (const callback of destroyCallbacks) {
        callback();
      }
    },
    get destroyed() {
      return destroyed;
    },
    get ɵparent() {
      return parent;
    },
  };

  Object.defineProperty(craftInjector, 'ɵonDestroy', {
    value: (callback: () => void) => {
      destroyCallbacks.push(callback);
    },
  });

  for (const provider of providers) {
    addProviderRecord(records, provider, craftInjector);
  }

  return craftInjector;
}

export function ɵcreateCraftInjectorFromHost(
  hostInjector: object,
  runInHostContext: CraftHostContextRunner,
): CraftInjector {
  const existing = hostInjectors.get(hostInjector);
  if (existing) {
    return existing;
  }

  const host = hostInjector as {
    get(token: object, notFoundValue?: unknown): unknown;
    destroy?: () => void;
    destroyed?: boolean;
  };
  const children: CraftInjector[] = [];
  const defaultValues = new Map<object, unknown>();
  let destroyed = false;
  const resolveDefault = (token: object): unknown | typeof ɵNOT_FOUND => {
    if (defaultValues.has(token)) return defaultValues.get(token);
    const value = lookupDefaultFactory(token);
    if (value !== ɵNOT_FOUND) defaultValues.set(token, value);
    return value;
  };
  const craftInjector: CraftInjector = {
    get<T>(token: object, notFoundValue?: T): T {
      const value = host.get(token, ɵNOT_FOUND);
      if (value !== ɵNOT_FOUND) {
        return value as T;
      }
      const fallback = resolveDefault(token);
      if (fallback !== ɵNOT_FOUND) {
        return fallback as T;
      }
      if (arguments.length >= 2) {
        return notFoundValue as T;
      }
      throw missingProviderError(token);
    },
    getOptional<T>(token: object): T | null {
      const value = host.get(token, ɵNOT_FOUND);
      if (value !== ɵNOT_FOUND) {
        return value as T;
      }
      const fallback = resolveDefault(token);
      return fallback === ɵNOT_FOUND ? null : (fallback as T);
    },
    run<T>(fn: () => T): T {
      return runInHostContext(() => {
        if (injectorStorage) {
          return injectorStorage.run(craftInjector, fn);
        }
        browserInjectorStack.push(craftInjector);
        try {
          return fn();
        } finally {
          browserInjectorStack.pop();
        }
      });
    },
    createChild(providers: readonly CraftProvider[]): CraftInjector {
      const child = createNativeCraftInjector(providers, craftInjector);
      children.push(child);
      return child;
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const child of children) {
        child.destroy();
      }
      host.destroy?.();
    },
    get destroyed() {
      return destroyed || host.destroyed === true;
    },
    get ɵparent() {
      return null;
    },
  };
  hostInjectors.set(hostInjector, craftInjector);
  return craftInjector;
}

function addProviderRecord(
  records: Map<object, ProviderRecord>,
  provider: CraftProvider,
  injector: CraftInjector,
): void {
  const token = provider.token;
  if (provider.multi || provider.collection) {
    const existing = records.get(token);
    const nextValue = createProviderRecord(provider, injector).resolve;
    const readNext = () =>
      provider.collection
        ? ((nextValue() as unknown[]) ?? [])
        : [nextValue()];
    if (existing?.collection) {
      const previous = existing.resolve as () => unknown[];
      records.set(token, {
        collection: true,
        resolve: () => [...previous(), ...readNext()],
      });
      return;
    }
    records.set(token, {
      collection: true,
      resolve: readNext,
    });
    return;
  }
  records.set(token, createProviderRecord(provider, injector));
}

function createProviderRecord(
  provider: CraftProvider,
  injector: CraftInjector,
): ProviderRecord {
  if ('useValue' in provider) {
    return {
      collection: provider.multi === true || provider.collection === true,
      resolve: () => provider.useValue,
    };
  }

  let resolved = false;
  let resolving = false;
  let value: unknown;
  const record: ProviderRecord = {
    collection: provider.multi === true || provider.collection === true,
    resolve() {
      if (!resolved) {
        if (resolving) {
          const activeIndex = activeProviderResolutions.findIndex(
            (active) => active.record === record,
          );
          const dependencyPath = [
            ...activeProviderResolutions
              .slice(Math.max(activeIndex, 0))
              .map(({ token: activeToken }) => tokenName(activeToken)),
            tokenName(provider.token),
          ];
          const error = new CraftCircularDependencyError(dependencyPath);
          globalThis.console?.error(error);
          throw error;
        }

        resolving = true;
        activeProviderResolutions.push({
          record,
          token: provider.token,
        });
        try {
          value = provider.useFactory(injector);
          resolved = true;
        } finally {
          activeProviderResolutions.pop();
          resolving = false;
        }
      }
      return value;
    },
  };
  return record;
}

function missingProviderError(token: object): Error {
  return new Error(`No provider for Craft token "${tokenName(token)}".`);
}
