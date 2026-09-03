import { isCraftSignal, type CraftSignal as Signal } from './host/craft-signal';
import { craftToken } from './host/craft-injector';
import type { SourceBranded } from './util/util';

function isCallableSignal(value: unknown): boolean {
  if (typeof value !== 'function') {
    return false;
  }
  const symbols = Object.getOwnPropertySymbols(value);
  return (
    symbols.some((symbol) => symbol.description === 'SIGNAL') ||
    'set' in value ||
    'update' in value
  );
}

/** Runtime/type brand carried by named reactive values exposed to templates. */
export const YIELDABLE_VALUE = Symbol('craft-yieldable-value');

/** Internal marker used by the synchronous Craft generator driver. */
export const REACTIVE_READ_REQUEST = Symbol('craft-reactive-read-request');

/** Internal escape hatch used by Craft itself to retain the raw host signal. */
export const RAW_REACTIVE_VALUE = Symbol('craft-raw-reactive-value');
const RAW_REACTIVE_ACTION = Symbol('craft-raw-reactive-action');

/** Type/runtime marker retaining the reader's resolved value type. */
export const REACTIVE_VALUE_TYPE = Symbol('craft-reactive-value-type');

/** Type-only carrier identifying the root reader and projected path. */
export const YIELDABLE_DEPENDENCY = Symbol('craft-yieldable-dependency');

/** Runtime/type marker for an explicitly adapted deep-yieldable reader. */
export const DEEP_YIELDABLE = Symbol('craft-deep-yieldable');

/** Type-only carrier propagated by computed readers. */
export const REACTIVE_DEPENDENCIES = Symbol('craft-reactive-dependencies');

/** Marker carried by the opt-in primitive insertion. */
export const DEEP_YIELDABLE_INSERTION = Symbol(
  'craft-deep-yieldable-insertion',
);

/** Marker carrying the state property that should receive a deep reader. */
export const DEEP_YIELDABLE_PROPERTY_INSERTION = Symbol(
  'craft-deep-yieldable-property-insertion',
);

/** Marker for the query/resource insertion that deepens only `value`. */
export const DEEP_YIELDABLE_VALUE_INSERTION = Symbol(
  'craft-deep-yieldable-value-insertion',
);

export type ReactiveDependencyMap = Readonly<{
  readonly source: unknown;
  readonly path: string;
}>;

export type YieldableDependency<Source, Path extends string> = {
  readonly [YIELDABLE_DEPENDENCY]?: {
    readonly source: Source;
    readonly path: Path;
  };
};

type DeepYieldableReadRequest<
  Value,
  Source,
  Path extends string,
> = ReactiveReadRequest<Value> & YieldableDependency<Source, Path>;

type DeepYieldableObject<
  Value extends object,
  Source,
  Path extends string,
  Depth extends readonly unknown[],
> = Depth extends readonly []
  ? {}
  : Value extends readonly unknown[]
    ? {}
    : Value extends (...args: any[]) => any
      ? {}
      : {
          readonly [Key in keyof Value as Key extends
            | typeof YIELDABLE_VALUE
            | typeof RAW_REACTIVE_VALUE
            | typeof REACTIVE_VALUE_TYPE
            | typeof YIELDABLE_DEPENDENCY
            | typeof DEEP_YIELDABLE
            ? never
            : Key]: DeepYieldableValue<
            Value[Key],
            Source,
            `${Path}.${Extract<Key, string>}`,
            Depth extends readonly [unknown, ...infer Rest] ? Rest : readonly []
          >;
        };

/** A lazily projected, yieldable view of one value property. */
export type DeepYieldableValue<
  Value,
  Source,
  Path extends string,
  Depth extends readonly unknown[] = readonly [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
  ],
> = (() => Generator<
  DeepYieldableReadRequest<Value, Source, Path>,
  Value,
  unknown
>) &
  DeepYieldableMarker &
  YieldableDependency<Source, Path> &
  (Value extends object ? DeepYieldableObject<Value, Source, Path, Depth> : {});

type ReaderValue<Reader> =
  Reader extends YieldableReactiveValue<infer Value, any, any>
    ? Value
    : Reader extends (...args: any[]) => Generator<any, infer Value, any>
      ? Value
      : never;

type ReaderName<Reader> =
  Reader extends YieldableReactiveValue<any, infer Name extends string, any>
    ? Name
    : string;

/** Type returned by {@link deepYieldable}. */
export type DeepYieldableReaderOf<Reader> = Reader &
  DeepYieldableObject<
    NonNullable<ReaderValue<Reader>> extends object
      ? NonNullable<ReaderValue<Reader>>
      : {},
    Reader,
    ReaderName<Reader>,
    readonly [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
    ]
  > &
  DeepYieldableMarker & {
    readonly [DEEP_YIELDABLE]: true;
  };

/**
 * A reactive reader whose object-valued result can be projected property by
 * property (`reader.profile.name`) while keeping every projection yieldable.
 */
export type DeepYieldableReactiveValue<
  Value,
  Name extends string = string,
> = DeepYieldableReaderOf<YieldableReactiveValue<Value, Name>>;

/** Structural companion to the runtime symbol, usable across project references. */
export type DeepYieldableMarker = {
  readonly __craftDeepYieldable: true;
};

export type ReactiveDependencyMapFromYielded<Yielded> = Yielded extends {
  readonly [YIELDABLE_DEPENDENCY]?: infer Dependency;
}
  ? Dependency
  : never;

export type DeepYieldableInsertion = {
  readonly [DEEP_YIELDABLE_INSERTION]: true;
} & ((context: unknown) => {
  readonly [DEEP_YIELDABLE_INSERTION]: true;
});

export type DeepYieldablePropertyInsertion<Property extends string = string> = {
  readonly [DEEP_YIELDABLE_INSERTION]: true;
  readonly [DEEP_YIELDABLE_PROPERTY_INSERTION]: Property;
} & ((context: unknown) => {
  readonly [DEEP_YIELDABLE_INSERTION]: true;
  readonly [DEEP_YIELDABLE_PROPERTY_INSERTION]: Property;
});

/**
 * Insertion marker for resources whose resolved `value` should expose lazy
 * deep projections. The owning primitive applies the marker to its resource
 * shape, including each selected resource of an identified query.
 */
export type DeepYieldableValueInsertion = {
  readonly [DEEP_YIELDABLE_VALUE_INSERTION]: true;
};

/**
 * Adapts a primitive's root reader, or exposes one named state property as a
 * separate deep-yieldable reader (`products` becomes `deepYieldableProducts`).
 */
export function insertDeepYieldable(): DeepYieldableInsertion;
export function insertDeepYieldable<const Property extends string>(
  property: Property,
): DeepYieldablePropertyInsertion<Property>;
export function insertDeepYieldable(
  property?: string,
): DeepYieldableInsertion | DeepYieldablePropertyInsertion<string> {
  const output = {} as {
    readonly [DEEP_YIELDABLE_INSERTION]: true;
    readonly [DEEP_YIELDABLE_PROPERTY_INSERTION]?: string;
  };
  Object.defineProperty(output, DEEP_YIELDABLE_INSERTION, {
    value: true,
    enumerable: false,
  });
  if (property !== undefined) {
    Object.defineProperty(output, DEEP_YIELDABLE_PROPERTY_INSERTION, {
      value: property,
      enumerable: false,
    });
  }

  const insertion = (() => output) as unknown as
    | DeepYieldableInsertion
    | DeepYieldablePropertyInsertion<string>;
  Object.defineProperty(insertion, DEEP_YIELDABLE_INSERTION, {
    value: true,
    enumerable: false,
  });
  if (property !== undefined) {
    Object.defineProperty(insertion, DEEP_YIELDABLE_PROPERTY_INSERTION, {
      value: property,
      enumerable: false,
    });
  }
  return insertion;
}

export function insertDeepYieldableValue():
  & ((context: unknown) => DeepYieldableValueInsertion)
  & DeepYieldableValueInsertion {
  const output = {} as DeepYieldableValueInsertion;
  Object.defineProperty(output, DEEP_YIELDABLE_VALUE_INSERTION, {
    value: true,
    enumerable: false,
  });
  const insertion = (() => output) as unknown as ((
    context: unknown,
  ) => DeepYieldableValueInsertion) & DeepYieldableValueInsertion;
  Object.defineProperty(insertion, DEEP_YIELDABLE_VALUE_INSERTION, {
    value: true,
    enumerable: false,
  });
  return insertion;
}

export function hasDeepYieldableInsertion(
  insertions: readonly unknown[],
): boolean {
  return insertions.some(
    (insertion) =>
      typeof insertion === 'function' && DEEP_YIELDABLE_INSERTION in insertion,
  );
}

export function getDeepYieldablePropertyInsertions(
  insertions: readonly unknown[],
): readonly string[] {
  return insertions.flatMap((insertion) => {
    if (
      typeof insertion !== 'function' ||
      !(DEEP_YIELDABLE_PROPERTY_INSERTION in insertion)
    ) {
      return [];
    }
    const property = Reflect.get(insertion, DEEP_YIELDABLE_PROPERTY_INSERTION);
    return typeof property === 'string' ? [property] : [];
  });
}

export function hasDeepYieldableRootInsertion(
  insertions: readonly unknown[],
): boolean {
  return insertions.some(
    (insertion) =>
      typeof insertion === 'function' &&
      DEEP_YIELDABLE_INSERTION in insertion &&
      !(DEEP_YIELDABLE_PROPERTY_INSERTION in insertion),
  );
}

export function hasDeepYieldableValueInsertion(
  insertions: readonly unknown[],
): boolean {
  return insertions.some(
    (insertion) =>
      typeof insertion === 'function' &&
      DEEP_YIELDABLE_VALUE_INSERTION in insertion,
  );
}

export type NamedYieldableValue<
  Name extends string = string,
  Value = unknown,
> = Value & {
  readonly [YIELDABLE_VALUE]: Name;
};

export type ReactiveReadIdentity = Readonly<{
  /** Stable display name of the reactive value. */
  name: string;
  /** Owning primitive, when the reader comes from one. */
  primitive?: string;
  /** Full property path below the owning primitive. */
  path?: string;
  /** Insertion key, when the value was created by an insertion. */
  insertion?: string;
  /** Computed name, when the value is a craftComputed. */
  computed?: string;
}>;

/** A request emitted by a public reactive reader and resolved by Craft. */
export type ReactiveReadRequest<T = unknown> = Readonly<{
  [REACTIVE_READ_REQUEST]: true;
  identity: ReactiveReadIdentity;
  read: () => T;
}>;

/** Public contract of every reactive value exposed by Craft. */
export type YieldableReactiveValue<
  T,
  Name extends string = string,
  Yielded = never,
> = NamedYieldableValue<
  Name,
  (() => Generator<ReactiveReadRequest<T> | Yielded, T, unknown>) & {
    readonly [RAW_REACTIVE_VALUE]: Signal<T>;
    readonly [REACTIVE_VALUE_TYPE]: T;
  } & Signal<T>
>;

export type YieldableReactiveSignal<
  Value extends Signal<any>,
  Name extends string,
> = YieldableReactiveValue<
  Value extends Signal<infer State> ? State : never,
  Name
> &
  Omit<Value, keyof Signal<any>>;

export type YieldableReactiveAction<Action extends (...args: any[]) => any> = ((
  ...args: Parameters<Action>
) => Generator<never, ReturnType<Action>, unknown>) & {
  readonly [RAW_REACTIVE_ACTION]: Action;
};

/** Recursively restores the raw signal-shaped contract used by Craft internals. */
export type RawReactiveProperties<Shape> =
  Shape extends YieldableReactiveValue<infer Value, any>
    ? Signal<Value>
    : Shape extends { readonly [RAW_REACTIVE_ACTION]: infer Action }
      ? Action
      : Shape extends (...args: any[]) => any
        ? Shape
        : Shape extends object
          ? {
              [Key in keyof Shape]: Key extends 'select' | 'selectOrCreate'
                ? Shape[Key] extends (...args: infer Args) => infer Result
                  ? (...args: Args) => RawReactiveProperties<Result>
                  : RawReactiveProperties<Shape[Key]>
                : RawReactiveProperties<Shape[Key]>;
            }
          : Shape;

/** Recursively replaces exposed Angular signals while preserving methods/plain values. */
export type YieldableReactiveProperties<Shape> = Shape extends SourceBranded
  ? Shape extends Signal<any>
    ? YieldableReactiveSignal<Shape, string>
    : Shape
  : Shape extends YieldableReactiveValue<any, any>
    ? Shape
    : Shape extends Signal<any>
      ? YieldableReactiveSignal<Shape, string>
      : Shape extends (...args: any[]) => any
        ? Shape
        : Shape extends object
          ? {
              [Key in keyof Shape]: Shape[Key] extends SourceBranded
                ? Shape[Key] extends Signal<any>
                  ? YieldableReactiveSignal<
                      Shape[Key],
                      Key extends string ? Key : string
                    >
                  : Shape[Key]
                : Shape[Key] extends Signal<any>
                  ? Shape[Key] extends YieldableReactiveValue<any, any>
                    ? Shape[Key]
                    : YieldableReactiveSignal<
                        Shape[Key],
                        Key extends string ? Key : string
                      >
                  : Shape[Key] extends YieldableReactiveValue<any, any>
                    ? Shape[Key]
                    : Shape[Key] extends (...args: any[]) => any
                      ? Key extends 'select' | 'selectOrCreate'
                        ? (
                            ...args: Parameters<Shape[Key]>
                          ) => YieldableReactiveProperties<
                            ReturnType<Shape[Key]>
                          >
                        : Key extends 'reload' | 'refresh'
                          ? YieldableReactiveAction<Shape[Key]>
                          : Shape[Key]
                      : Shape[Key] extends object
                        ? YieldableReactiveProperties<Shape[Key]>
                        : Shape[Key];
            }
          : Shape;

export type ReactiveReadEdge = Readonly<{
  reader?: ReactiveReadIdentity;
  dependency: ReactiveReadIdentity;
}>;

export type ReactiveReadObserver = (edge: ReactiveReadEdge) => void;

let activeReactiveReader: ReactiveReadIdentity | undefined;

export function ɵactiveReactiveReader(): ReactiveReadIdentity | undefined {
  return activeReactiveReader;
}

export function ɵwithActiveReactiveReader<T>(
  identity: ReactiveReadIdentity,
  read: () => T,
): T {
  const previous = activeReactiveReader;
  activeReactiveReader = identity;
  try {
    return read();
  } finally {
    activeReactiveReader = previous;
  }
}

/** Observability hook notified whenever a Craft generator resolves a reactive read. */
export const REACTIVE_READ_OBSERVERS = Object.assign(
  craftToken<readonly ReactiveReadObserver[]>('REACTIVE_READ_OBSERVERS'),
  {
    ɵfactory: (): readonly ReactiveReadObserver[] => [],
  },
);

export function provideReactiveReadObserver(
  observer: ReactiveReadObserver,
): {
  provide: typeof REACTIVE_READ_OBSERVERS;
  useValue: ReactiveReadObserver;
  multi: true;
} {
  return { provide: REACTIVE_READ_OBSERVERS, useValue: observer, multi: true };
}

export function isReactiveReadRequest(
  value: unknown,
): value is ReactiveReadRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    REACTIVE_READ_REQUEST in value
  );
}

export function isYieldableReactiveValue(
  value: unknown,
): value is YieldableReactiveValue<unknown> {
  return (
    typeof value === 'function' &&
    RAW_REACTIVE_VALUE in value &&
    YIELDABLE_VALUE in value
  );
}

export function rawReactiveValue<T>(
  value: YieldableReactiveValue<T>,
): Signal<T> {
  return value[RAW_REACTIVE_VALUE];
}

/** Reconstructs the internal signal-shaped view expected by legacy internals. */
const rawFacadeCache = new WeakMap<object, unknown>();

export function rawReactiveFacade<Shape>(
  value: Shape,
): RawReactiveProperties<Shape> {
  if (isYieldableReactiveValue(value)) {
    return rawReactiveValue(value) as RawReactiveProperties<Shape>;
  }
  if (typeof value === 'function' && RAW_REACTIVE_ACTION in value) {
    return value[RAW_REACTIVE_ACTION] as RawReactiveProperties<Shape>;
  }
  if (typeof value !== 'object' || value === null) {
    return value as RawReactiveProperties<Shape>;
  }
  const cached = rawFacadeCache.get(value);
  if (cached) return cached as RawReactiveProperties<Shape>;
  const facade = new Proxy(value, {
    get(target, property, receiver) {
      return rawReactiveFacade(Reflect.get(target, property, receiver));
    },
  });
  rawFacadeCache.set(value, facade);
  return facade as RawReactiveProperties<Shape>;
}

/** Applies an insertion key to an anonymous craftComputed reader. */
export function nameInsertedReactiveValue<const Name extends string>(
  value: unknown,
  name: Name,
  primitive: string,
  path: string,
): unknown {
  if (!isYieldableReactiveValue(value)) return value;
  if (value[YIELDABLE_VALUE] !== 'computed') return value;
  return createYieldableReactiveValue(value[RAW_REACTIVE_VALUE], name, {
    primitive,
    insertion: name,
    computed: name,
    path,
  });
}

export function createYieldableReactiveValue<T, const Name extends string>(
  source: Signal<T>,
  name: Name,
  identity: Omit<ReactiveReadIdentity, 'name'> = {},
): YieldableReactiveValue<T, Name> {
  const reader = function* reactiveReader(): Generator<
    ReactiveReadRequest<T>,
    T,
    unknown
  > {
    const value = yield {
      [REACTIVE_READ_REQUEST]: true,
      identity: { name, ...identity },
      read: source,
    };
    return value as T;
  };

  Object.defineProperties(reader, {
    [YIELDABLE_VALUE]: {
      value: name,
      enumerable: false,
      configurable: true,
    },
    [RAW_REACTIVE_VALUE]: {
      value: source,
      enumerable: false,
      configurable: true,
    },
    [REACTIVE_VALUE_TYPE]: {
      get: source,
      enumerable: false,
      configurable: true,
    },
  });

  return reader as YieldableReactiveValue<T, Name>;
}

const deepYieldableCache = new WeakMap<object, unknown>();
const deepYieldableRoots = new WeakSet<object>();

function rawSourceOf(value: object): Signal<unknown> | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, RAW_REACTIVE_VALUE);
  return descriptor?.value as Signal<unknown> | undefined;
}

function readProjectedPath(
  source: () => unknown,
  path: readonly PropertyKey[],
): unknown {
  let value: unknown = source();
  for (const property of path) {
    value = value == null ? undefined : Reflect.get(Object(value), property);
  }
  return value;
}

function createDeepProjection(
  root: object,
  path: readonly PropertyKey[],
): unknown {
  const pathText = [
    String(Reflect.get(root, YIELDABLE_VALUE) ?? 'reader'),
    ...path.map(String),
  ].join('.');
  const rootSignal = rawSourceOf(root);

  const reader = function* deepProjectedReader(): Generator<
    ReactiveReadRequest<unknown>,
    unknown,
    unknown
  > {
    if (rootSignal) {
      const value = yield {
        [REACTIVE_READ_REQUEST]: true,
        identity: {
          name: String(path[path.length - 1] ?? pathText),
          path: pathText,
        },
        read: () => readProjectedPath(rootSignal, path),
      };
      return value;
    }

    const rootValue =
      typeof root === 'function'
        ? yield* (
            root as unknown as () => Generator<
              ReactiveReadRequest<unknown>,
              unknown,
              unknown
            >
          )()
        : root;
    return readProjectedPath(() => rootValue, path);
  };

  Object.defineProperty(reader, YIELDABLE_VALUE, {
    value: pathText,
    enumerable: false,
  });

  return new Proxy(reader, {
    get(target, property, receiver) {
      if (isFunctionNativeProperty(property)) {
        return Reflect.get(target, property, receiver);
      }
      if (property === '__craftDeepYieldable') return true;
      if (property !== 'name' && Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property !== 'string' && typeof property !== 'number') {
        return undefined;
      }
      return getDeepProjection(root, [...path, property]);
    },
    has(target, property) {
      if (isFunctionNativeProperty(property)) return true;
      return Reflect.has(target, property);
    },
  });
}

function getDeepProjection(
  root: object,
  path: readonly PropertyKey[],
): unknown {
  const cacheKey = path.map(String).join('.');
  const cached = deepYieldableCache.get(root);
  if (cached && cached instanceof Map && cached.has(cacheKey)) {
    return cached.get(cacheKey);
  }

  const projection = createDeepProjection(root, path);
  const nextCache = cached instanceof Map ? cached : new Map<string, unknown>();
  nextCache.set(cacheKey, projection);
  deepYieldableCache.set(root, nextCache);
  return projection;
}

function isFunctionNativeProperty(property: PropertyKey): boolean {
  return (
    property === 'prototype' ||
    property === 'arguments' ||
    property === 'caller'
  );
}

/**
 * Explicitly adapts a reader so data properties become stable lazy readers.
 * Ordinary readers are deliberately left untouched until this function is
 * called.
 */
export function deepYieldable<Reader>(
  reader: Reader,
): Reader extends object ? DeepYieldableReaderOf<Reader> : Reader {
  if (
    (typeof reader !== 'function' &&
      (typeof reader !== 'object' || reader === null)) ||
    deepYieldableRoots.has(reader as object)
  ) {
    return reader as Reader extends object
      ? DeepYieldableReaderOf<Reader>
      : Reader;
  }

  const root = reader as unknown as object;
  const facade = new Proxy(root, {
    get(target, property, receiver) {
      if (isFunctionNativeProperty(property)) {
        return Reflect.get(target, property, receiver);
      }
      if (property === '__craftDeepYieldable') return true;
      if (
        property !== 'name' &&
        rawSourceOf(root) &&
        Reflect.has(target, property)
      ) {
        return Reflect.get(target, property, receiver);
      }
      if (property === YIELDABLE_VALUE) return 'deep-yieldable';
      if (property === DEEP_YIELDABLE) return true;
      if (typeof property !== 'string' && typeof property !== 'number') {
        return undefined;
      }
      return getDeepProjection(root, [property]);
    },
    has(target, property) {
      if (isFunctionNativeProperty(property)) return true;
      return (
        property === '__craftDeepYieldable' ||
        property === YIELDABLE_VALUE ||
        property === DEEP_YIELDABLE ||
        Reflect.has(target, property)
      );
    },
  });
  Object.defineProperty(facade, '__craftDeepYieldable', {
    value: true,
    enumerable: false,
  });
  deepYieldableRoots.add(facade);
  return facade as Reader extends object
    ? DeepYieldableReaderOf<Reader>
    : Reader;
}

const facadeCache = new WeakMap<object, Map<string, unknown>>();

/**
 * Creates a non-mutating public view of a primitive/ref. Signal calls become
 * reactive read generators; non-reactive methods and values keep their runtime
 * contract. Nested signal properties are adapted lazily and cached.
 */
export function createYieldableReactiveFacade<Shape>(
  value: Shape,
  identity: ReactiveReadIdentity,
): YieldableReactiveProperties<Shape> {
  return createFacade(
    value,
    identity,
    identity.path ?? identity.name,
  ) as YieldableReactiveProperties<Shape>;
}

/**
 * Creates the deep reader used by resource collections such as
 * `query.exceptions`. Unlike `deepYieldable`, this starts from the raw signal
 * so the primitive can opt one reactive property into deep projection without
 * making the whole primitive deeply yieldable.
 */
export function createDeepYieldableReactiveValue<
  Value,
  const Name extends string,
>(
  source: Signal<Value>,
  name: Name,
  identity: Omit<ReactiveReadIdentity, 'name'> = {},
): DeepYieldableReactiveValue<Value, Name> {
  return deepYieldable(
    createYieldableReactiveValue(source, name, identity),
  ) as DeepYieldableReactiveValue<Value, Name>;
}

function createFacade(
  value: unknown,
  identity: ReactiveReadIdentity,
  path: string,
  deep = false,
): unknown {
  if (typeof value !== 'object' && typeof value !== 'function') return value;
  if (value === null) return value;
  // Generator/iterator instances carry native methods whose receiver must be
  // the original instance. Proxying one (for example, the invocation returned
  // by an insertion method named `select`) makes `yield*` call `.next` with the
  // proxy as receiver and throws "incompatible receiver".
  if (
    'next' in value &&
    typeof (value as { next?: unknown }).next === 'function'
  ) {
    return value;
  }
  if (isDeepYieldable(value) || isYieldableReactiveValue(value)) return value;

  const cacheKey = `${identity.primitive ?? ''}|${identity.computed ?? ''}|${path}`;
  const cachedByPath = facadeCache.get(value as object);
  if (cachedByPath?.has(cacheKey)) return cachedByPath.get(cacheKey);

  let facade: unknown;
  if (isCraftSignal(value) || isCallableSignal(value)) {
    const pathParts = path.split('.');
    const propertyName = pathParts[pathParts.length - 1] ?? identity.name;
    const reader = createYieldableReactiveValue(
      value as unknown as Signal<unknown>,
      propertyName,
      {
        ...identity,
        path,
      },
    );
    facade = deep
      ? deepYieldable(reader)
      : new Proxy(reader, {
          get(_target, property) {
            if (
              property === YIELDABLE_VALUE ||
              property === RAW_REACTIVE_VALUE
            ) {
              return Reflect.get(reader, property);
            }
            if (!Reflect.has(value, property) && Reflect.has(reader, property)) {
              return createFacade(
                Reflect.get(reader, property),
                identity,
                `${path}.${String(property)}`,
              );
            }
            const child = Reflect.get(value, property);
            if (
              (property === 'select' || property === 'selectOrCreate') &&
              typeof child === 'function'
            ) {
              return (...args: unknown[]) =>
                createFacade(
                  Reflect.apply(child, value, args),
                  identity,
                  `${path}.${String(property)}.${String(args[0] ?? 'selected')}`,
                );
            }
            return createFacade(
              child,
              {
                ...identity,
                insertion:
                  identity.insertion ??
                  (typeof property === 'string' ? property : undefined),
              },
              `${path}.${String(property)}`,
            );
          },
          ownKeys: (target) => [
            ...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(value)]),
          ],
          getOwnPropertyDescriptor(_target, property) {
            const targetDescriptor = Reflect.getOwnPropertyDescriptor(
              reader,
              property,
            );
            if (targetDescriptor) return targetDescriptor;
            const descriptor = Reflect.getOwnPropertyDescriptor(value, property);
            return descriptor
              ? { ...descriptor, configurable: true }
              : undefined;
          },
          has: (_target, property) =>
            property === YIELDABLE_VALUE ||
            property === RAW_REACTIVE_VALUE ||
            Reflect.has(value, property),
      });
  } else {
    facade = new Proxy(value as object, {
      get(target, property, receiver) {
        const child = Reflect.get(target, property, receiver);
        if (
          (property === 'reload' || property === 'refresh') &&
          typeof child === 'function'
        ) {
          const action = function* yieldableReactiveAction(
            ...args: unknown[]
          ): Generator<never, unknown, unknown> {
            return Reflect.apply(child, target, args);
          };
          Object.defineProperty(action, RAW_REACTIVE_ACTION, { value: child });
          return action;
        }
        if (
          (property === 'select' || property === 'selectOrCreate') &&
          typeof child === 'function'
        ) {
          return (...args: unknown[]) =>
            createFacade(
              Reflect.apply(child, target, args),
              identity,
              `${path}.${String(property)}.${String(args[0] ?? 'selected')}`,
            );
        }
        if (
          !isCraftSignal(child) &&
          !isCallableSignal(child) &&
          (typeof child !== 'object' || child === null)
        ) {
          return child;
        }
        return createFacade(
          child,
          {
            ...identity,
            insertion:
              identity.insertion ??
              (typeof property === 'string' ? property : undefined),
          },
          `${path}.${String(property)}`,
          property === 'exceptions',
        );
      },
    });
  }

  const nextCache = cachedByPath ?? new Map<string, unknown>();
  nextCache.set(cacheKey, facade);
  if (!cachedByPath) facadeCache.set(value as object, nextCache);
  return facade;
}

export function isDeepYieldable(value: unknown): value is DeepYieldableMarker {
  if (
    !(
      (typeof value === 'object' && value !== null) ||
      typeof value === 'function'
    )
  ) {
    return false;
  }

  const object = value as object;
  return (
    '__craftDeepYieldable' in object ||
    Reflect.get(object, '__craftDeepYieldable') === true
  );
}
