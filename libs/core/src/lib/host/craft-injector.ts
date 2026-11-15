export type CraftProvider<T = unknown> =
  | { token: object; useValue: T; multi?: boolean; collection?: boolean }
  | {
      token: object;
      useFactory: (injector: CraftInjector) => T;
      multi?: boolean;
      collection?: boolean;
      /**
       * @internal The factory only reads what the injector already holds (the
       * injector itself, a value attached to it): it is asked at every lookup
       * and its answer is not kept.
       */
      ɵtransient?: boolean;
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
  declaration: Declaration;
  injector: CraftInjector;
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

/**
 * A provider as an injector keeps it. Nothing in a declaration belongs to one
 * injector: what a factory built is kept by the injector that resolved it, so
 * the same declarations can serve every injector created from them.
 */
type Declaration = {
  readonly provider: CraftProvider;
  /** A multi or collection declaration resolves to an array. */
  readonly collection: boolean;
  /** The collection declared before it for the same token, read first. */
  readonly previous: Declaration | undefined;
};

type Declarations = Map<object, Declaration>;

const NO_DECLARATIONS: Declarations = new Map();
/** Passed down a lookup that was given no fallback: a miss throws. */
const NO_FALLBACK = Symbol('CraftInjector.noFallback');

function declare(providers: readonly CraftProvider[]): Declarations {
  if (providers.length === 0) return NO_DECLARATIONS;
  const declarations: Declarations = new Map();
  for (const provider of providers) {
    const token = provider.token;
    if (provider.multi || provider.collection) {
      const existing = declarations.get(token);
      declarations.set(token, {
        provider,
        collection: true,
        previous: existing?.collection ? existing : undefined,
      });
    } else {
      declarations.set(token, {
        provider,
        collection: false,
        previous: undefined,
      });
    }
  }
  return declarations;
}

/**
 * Declarations prepared once and shared by every injector created from them
 * with {@link ɵcreateChildFromProviderSet}: creating such an injector neither
 * walks the providers nor copies them.
 */
export type ɵCraftProviderSet = {
  readonly providers: readonly CraftProvider[];
  readonly declarations: Declarations;
};

export function ɵprepareCraftProviders(
  providers: readonly CraftProvider[],
): ɵCraftProviderSet {
  const kept = [...providers];
  return { providers: kept, declarations: declare(kept) };
}

/**
 * A child of `parent` built from prepared declarations. A parent that is not a
 * native injector creates the child its own way, from the same providers.
 */
export function ɵcreateChildFromProviderSet(
  parent: CraftInjector,
  set: ɵCraftProviderSet,
): CraftInjector {
  return parent instanceof NativeCraftInjector
    ? parent.createChildFrom(set.declarations)
    : parent.createChild(set.providers);
}

class NativeCraftInjector implements CraftInjector {
  private readonly parent: CraftInjector | null;
  private declarations: Declarations;
  // What this injector's factories built: the first one inline, since most
  // injectors resolve a single factory, the following ones in a map.
  private firstResolved: Declaration | undefined = undefined;
  private firstValue: unknown = undefined;
  private values: Map<Declaration, unknown> | undefined = undefined;
  // Allocated on first need: most injectors never build a default.
  private defaultValues: Map<object, unknown> | undefined = undefined;
  // Children in creation order, as a list: creating and destroying a child
  // write a few pointers, whatever the number of siblings.
  private firstChild: NativeCraftInjector | undefined = undefined;
  private lastChild: NativeCraftInjector | undefined = undefined;
  private previousSibling: NativeCraftInjector | undefined = undefined;
  private nextSibling: NativeCraftInjector | undefined = undefined;
  private attached: boolean;
  private isDestroyed = false;
  private destroyCallbacks: Array<() => void> | undefined = undefined;
  /**
   * Created without providers or parent. The app, test and component roots
   * are environment injectors placed right under one of these: that
   * environment, not the empty root, owns `providedIn: 'root'` defaults.
   */
  private readonly bare: boolean;
  // A default built in the empty root would not see the app's providers (its
  // registry, its router): the environment right below it owns them instead.
  private readonly ownsDefaults: boolean;
  /** @internal The DestroyRef an environment injector answers with. */
  ɵdestroyRef: unknown = undefined;
  /** @internal What the creator of this injector attached to it. */
  ɵinstance: unknown = undefined;

  constructor(
    declarations: Declarations,
    parent: CraftInjector | null,
    attached: boolean,
  ) {
    this.declarations = declarations;
    this.parent = parent;
    this.attached = attached;
    this.bare = parent === null && declarations.size === 0;
    this.ownsDefaults = parent instanceof NativeCraftInjector && parent.bare;
  }

  get<T>(token: object, notFoundValue?: T): T {
    // Whether a fallback was passed is read once, here: the chain of parents
    // below is walked with it, or with the marker of a miss that must throw.
    return this.lookup(
      token,
      arguments.length >= 2 ? notFoundValue : NO_FALLBACK,
    ) as T;
  }

  /** @internal `get` with its fallback, or `NO_FALLBACK` to throw on a miss. */
  lookup(token: object, fallback: unknown): unknown {
    if (token === this) {
      return this;
    }
    const local = this.declarations.get(token);
    if (local !== undefined) {
      return this.resolveLocal(local, token);
    }
    if (this.ownsDefaults) {
      const own = this.resolveDefault(token);
      if (own !== ɵNOT_FOUND) return own;
    }
    const parent = this.parent;
    if (parent) {
      if (fallback !== NO_FALLBACK) {
        return parent instanceof NativeCraftInjector
          ? parent.lookup(token, fallback)
          : parent.get(token, fallback);
      }
      try {
        return parent instanceof NativeCraftInjector
          ? parent.lookup(token, NO_FALLBACK)
          : parent.get(token);
      } catch (error) {
        const own = this.resolveDefault(token);
        if (own !== ɵNOT_FOUND) {
          return own;
        }
        // The miss the parent raised is the miss of this lookup: rethrown, not built again
        // at every level of the chain, where each Error costs a stack trace.
        throw error instanceof Error &&
          error.message === missingProviderMessage(token)
          ? error
          : missingProviderError(token);
      }
    }
    const own = this.resolveDefault(token);
    if (own !== ɵNOT_FOUND) {
      return own;
    }
    if (fallback !== NO_FALLBACK) {
      return fallback;
    }
    throw missingProviderError(token);
  }

  getOptional<T>(token: object): T | null {
    if (token === this) {
      return this as unknown as T;
    }
    const local = this.declarations.get(token);
    if (local !== undefined) {
      return this.resolveLocal(local, token) as T;
    }
    if (this.ownsDefaults) {
      const own = this.resolveDefault(token);
      if (own !== ɵNOT_FOUND) return own as T;
    }
    if (this.parent) {
      const inherited = this.parent.getOptional(token);
      if (inherited !== null) {
        return inherited as T;
      }
    }
    const fallback = this.resolveDefault(token);
    return fallback === ɵNOT_FOUND ? null : (fallback as T);
  }

  run<T>(fn: () => T): T {
    if (injectorStorage) {
      return injectorStorage.run(this, fn);
    }
    browserInjectorStack.push(this);
    try {
      return fn();
    } finally {
      browserInjectorStack.pop();
    }
  }

  createChild(childProviders: readonly CraftProvider[]): CraftInjector {
    return this.createChildFrom(declare(childProviders));
  }

  /** @internal */
  createChildFrom(declarations: Declarations): CraftInjector {
    if (this.isDestroyed) {
      throw new Error('Cannot create a child of a destroyed Craft injector.');
    }
    const child = new NativeCraftInjector(declarations, this, true);
    const last = this.lastChild;
    if (last) {
      last.nextSibling = child;
      child.previousSibling = last;
    } else {
      this.firstChild = child;
    }
    this.lastChild = child;
    return child;
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    // Every child, then every callback, runs before any failure surfaces.
    let errors: unknown[] | undefined;
    if (this.firstChild) {
      const children: NativeCraftInjector[] = [];
      for (
        let child: NativeCraftInjector | undefined = this.firstChild;
        child;
        child = child.nextSibling
      ) {
        children.push(child);
      }
      for (const child of children) {
        try {
          child.destroy();
        } catch (error) {
          (errors ??= []).push(error);
        }
      }
    }
    const callbacks = this.destroyCallbacks;
    if (callbacks) {
      this.destroyCallbacks = undefined;
      for (const callback of callbacks) {
        try {
          callback();
        } catch (error) {
          (errors ??= []).push(error);
        }
      }
    }
    // A long-lived application must not retain every view it once owned.
    this.detach();
    this.firstChild = this.lastChild = undefined;
    this.declarations = NO_DECLARATIONS;
    this.firstResolved = this.firstValue = undefined;
    this.values = undefined;
    this.defaultValues = undefined;
    if (errors) {
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, 'Craft cleanup failed.');
    }
  }

  get destroyed(): boolean {
    return this.isDestroyed;
  }

  get ɵparent(): CraftInjector | null {
    return this.parent;
  }

  ɵonDestroy(callback: () => void): void {
    (this.destroyCallbacks ??= []).push(callback);
  }

  private detach(): void {
    if (!this.attached) return;
    this.attached = false;
    const parent = this.parent as NativeCraftInjector;
    const previous = this.previousSibling;
    const next = this.nextSibling;
    if (previous) previous.nextSibling = next;
    else if (parent.firstChild === this) parent.firstChild = next;
    if (next) next.previousSibling = previous;
    else if (parent.lastChild === this) parent.lastChild = previous;
    this.previousSibling = this.nextSibling = undefined;
  }

  private resolveLocal(local: Declaration, token: object): unknown {
    const value = this.resolveDeclaration(local);
    if (local.collection) {
      const parentValues = this.parent
        ? ((this.parent.getOptional(token) as unknown[] | null) ?? [])
        : [];
      return [
        ...(Array.isArray(parentValues) ? parentValues : []),
        ...(value as unknown[]),
      ];
    }
    return value;
  }

  private resolveDeclaration(declaration: Declaration): unknown {
    if (!declaration.collection) return this.resolveProvider(declaration);
    const provider = declaration.provider;
    const value = this.resolveProvider(declaration);
    const own = provider.collection ? ((value as unknown[]) ?? []) : [value];
    return declaration.previous
      ? [
          ...(this.resolveDeclaration(declaration.previous) as unknown[]),
          ...own,
        ]
      : own;
  }

  private resolveProvider(declaration: Declaration): unknown {
    const provider = declaration.provider;
    // A value is read from its provider at each lookup.
    if ('useValue' in provider) return provider.useValue;
    if (provider.ɵtransient) return provider.useFactory(this);

    if (this.firstResolved === declaration) return this.firstValue;
    const values = this.values;
    if (values !== undefined) {
      const known = values.get(declaration);
      if (known !== undefined || values.has(declaration)) return known;
    }
    let activeIndex = -1;
    for (let index = 0; index < activeProviderResolutions.length; index += 1) {
      const active = activeProviderResolutions[index];
      if (active.declaration === declaration && active.injector === this) {
        activeIndex = index;
        break;
      }
    }
    if (activeIndex >= 0) {
      const dependencyPath = [
        ...activeProviderResolutions
          .slice(activeIndex)
          .map(({ token: activeToken }) => tokenName(activeToken)),
        tokenName(provider.token),
      ];
      const error = new CraftCircularDependencyError(dependencyPath);
      globalThis.console?.error(error);
      throw error;
    }

    activeProviderResolutions.push({
      declaration,
      injector: this,
      token: provider.token,
    });
    let value: unknown;
    try {
      value = provider.useFactory(this);
    } finally {
      activeProviderResolutions.pop();
    }
    if (this.firstResolved === undefined) {
      this.firstResolved = declaration;
      this.firstValue = value;
    } else {
      (this.values ??= new Map()).set(declaration, value);
    }
    return value;
  }

  private resolveDefault(token: object): unknown | typeof ɵNOT_FOUND {
    const defaults = this.defaultValues;
    if (defaults?.has(token)) return defaults.get(token);
    // Most misses are tokens without a default: nothing to build, so no
    // injection context to open at every level of the chain.
    if (typeof (token as TokenWithFactory).ɵfactory !== 'function') {
      return ɵNOT_FOUND;
    }
    // Built where it is kept: a default asked for by a child (a token defined
    // after this injector, in a lazy route) must not take the child's host,
    // providers or lifetime.
    const value = this.run(() => readDefaultFactory(token));
    if (value !== ɵNOT_FOUND)
      (this.defaultValues ??= new Map()).set(token, value);
    return value;
  }
}

function createNativeCraftInjector(
  providers: readonly CraftProvider[],
  parent: CraftInjector | null,
): CraftInjector {
  return new NativeCraftInjector(declare(providers), parent, false);
}

function missingProviderMessage(token: object): string {
  return `No provider for Craft token "${tokenName(token)}".`;
}

function missingProviderError(token: object): Error {
  return new Error(missingProviderMessage(token));
}
