declare const CraftTokenBrand: unique symbol;

export type CraftToken<T> = {
  readonly debugName: string;
  readonly [CraftTokenBrand]: T;
};

export type CraftProvider<T = unknown> =
  | { token: CraftToken<T>; useValue: T }
  | { token: CraftToken<T>; useFactory: (injector: CraftInjector) => T };

export interface CraftInjector {
  get<T>(token: CraftToken<T>): T;
  getOptional<T>(token: CraftToken<T>): T | null;
  run<T>(fn: () => T): T;
  createChild(providers: readonly CraftProvider[]): CraftInjector;
}

type ProviderRecord = {
  resolve(): unknown;
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
const NOT_FOUND = Symbol('CraftInjector.notFound');

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

function createNativeCraftInjector(
  providers: readonly CraftProvider[],
  parent: CraftInjector | null,
): CraftInjector {
  const records = new Map<CraftToken<unknown>, ProviderRecord>();
  const craftInjector: CraftInjector = {
    get<T>(token: CraftToken<T>): T {
      const local = records.get(token);
      if (local) {
        return local.resolve() as T;
      }
      if (parent) {
        return parent.get(token);
      }
      throw missingProviderError(token);
    },
    getOptional<T>(token: CraftToken<T>): T | null {
      const local = records.get(token);
      if (local) {
        return local.resolve() as T;
      }
      return parent ? parent.getOptional(token) : null;
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
    createChild(providers: readonly CraftProvider[]): CraftInjector {
      return createNativeCraftInjector(providers, craftInjector);
    },
  };

  for (const provider of providers) {
    records.set(provider.token, createProviderRecord(provider, craftInjector));
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
  };
  const craftInjector: CraftInjector = {
    get<T>(token: CraftToken<T>): T {
      const value = host.get(hostTokens.get(token) ?? token, NOT_FOUND);
      if (value === NOT_FOUND) {
        throw missingProviderError(token);
      }
      return value as T;
    },
    getOptional<T>(token: CraftToken<T>): T | null {
      const value = host.get(hostTokens.get(token) ?? token, NOT_FOUND);
      return value === NOT_FOUND ? null : (value as T);
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
      return createNativeCraftInjector(providers, craftInjector);
    },
  };
  hostInjectors.set(hostInjector, craftInjector);
  return craftInjector;
}

export function ɵregisterCraftTokenHostToken<T>(
  token: CraftToken<T>,
  hostToken: object,
): void {
  hostTokens.set(token, hostToken);
}

function createProviderRecord(
  provider: CraftProvider,
  injector: CraftInjector,
): ProviderRecord {
  if ('useValue' in provider) {
    return {
      resolve: () => provider.useValue,
    };
  }

  let resolved = false;
  let value: unknown;
  return {
    resolve() {
      if (!resolved) {
        value = provider.useFactory(injector);
        resolved = true;
      }
      return value;
    },
  };
}

function missingProviderError(token: CraftToken<unknown>): Error {
  return new Error(`No provider for Craft token "${token.debugName}".`);
}
