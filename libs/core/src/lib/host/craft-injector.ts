declare const CraftTokenBrand: unique symbol;

export type CraftToken<T> = {
  readonly debugName: string;
  readonly [CraftTokenBrand]: T;
};

export type CraftProvider<T = unknown> =
  | { token: CraftToken<T> | object; useValue: T; multi?: boolean }
  | {
      token: CraftToken<T> | object;
      useFactory: (injector: CraftInjector) => T;
      multi?: boolean;
    };

export type CraftInjectToken<T> =
  | CraftToken<T>
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
  readonly multi: boolean;
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
const hostTokens = new WeakMap<object, object>();
export const ɵNOT_FOUND = Symbol('CraftInjector.notFound');

export function craftToken<T>(debugName: string): CraftToken<T> {
  return { debugName } as CraftToken<T>;
}

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
      'getCurrentCraftInjector() must be called inside injector.run().',
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
  const direct = records.get(token);
  if (direct) {
    return direct;
  }
  const aliased = hostTokens.get(token);
  return aliased ? records.get(aliased) : undefined;
}

function lookupDefaultFactory(token: object): unknown | typeof ɵNOT_FOUND {
  const direct = readDefaultFactory(token);
  if (direct !== ɵNOT_FOUND) {
    return direct;
  }
  const aliased = hostTokens.get(token);
  return aliased ? readDefaultFactory(aliased) : ɵNOT_FOUND;
}

function createNativeCraftInjector(
  providers: readonly CraftProvider[],
  parent: CraftInjector | null,
): CraftInjector {
  const records = new Map<object, ProviderRecord>();
  const children: CraftInjector[] = [];
  let destroyed = false;
  const destroyCallbacks: Array<() => void> = [];
  const craftInjector: CraftInjector = {
    get<T>(token: CraftToken<T> | object, notFoundValue?: T): T {
      if (token === craftInjector) {
        return craftInjector as T;
      }
      const local = lookupRecord(records, token);
      if (local) {
        const value = local.resolve();
        if (local.multi) {
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
          const fallback = lookupDefaultFactory(token);
          if (fallback !== ɵNOT_FOUND) {
            return fallback as T;
          }
          throw missingProviderError(token);
        }
      }
      const fallback = lookupDefaultFactory(token);
      if (fallback !== ɵNOT_FOUND) {
        return fallback as T;
      }
      if (arguments.length >= 2) {
        return notFoundValue as T;
      }
      throw missingProviderError(token);
    },
    getOptional<T>(token: CraftToken<T> | object): T | null {
      if (token === craftInjector) {
        return craftInjector as T;
      }
      const local = lookupRecord(records, token);
      if (local) {
        const value = local.resolve();
        if (local.multi) {
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
          return inherited;
        }
      }
      const fallback = lookupDefaultFactory(token);
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
  let destroyed = false;
  const craftInjector: CraftInjector = {
    get<T>(token: CraftToken<T> | object, notFoundValue?: T): T {
      const hostToken = hostTokens.get(token) ?? token;
      const value = host.get(hostToken, ɵNOT_FOUND);
      if (value !== ɵNOT_FOUND) {
        return value as T;
      }
      const fallback = lookupDefaultFactory(token);
      if (fallback !== ɵNOT_FOUND) {
        return fallback as T;
      }
      if (arguments.length >= 2) {
        return notFoundValue as T;
      }
      throw missingProviderError(token);
    },
    getOptional<T>(token: CraftToken<T> | object): T | null {
      const hostToken = hostTokens.get(token) ?? token;
      const value = host.get(hostToken, ɵNOT_FOUND);
      if (value !== ɵNOT_FOUND) {
        return value as T;
      }
      const fallback = lookupDefaultFactory(token);
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

export function ɵregisterCraftTokenHostToken(
  token: object,
  hostToken: object,
): void {
  hostTokens.set(token, hostToken);
}

function addProviderRecord(
  records: Map<object, ProviderRecord>,
  provider: CraftProvider,
  injector: CraftInjector,
): void {
  const token = provider.token;
  if (provider.multi) {
    const existing = records.get(token);
    const nextValue = createProviderRecord(provider, injector).resolve;
    if (existing?.multi) {
      const previous = existing.resolve as () => unknown[];
      records.set(token, {
        multi: true,
        resolve: () => [...previous(), nextValue()],
      });
      return;
    }
    records.set(token, {
      multi: true,
      resolve: () => [nextValue()],
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
      multi: provider.multi === true,
      resolve: () => provider.useValue,
    };
  }

  let resolved = false;
  let value: unknown;
  return {
    multi: provider.multi === true,
    resolve() {
      if (!resolved) {
        value = provider.useFactory(injector);
        resolved = true;
      }
      return value;
    },
  };
}

function missingProviderError(token: object): Error {
  return new Error(`No provider for Craft token "${tokenName(token)}".`);
}
