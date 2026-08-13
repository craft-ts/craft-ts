import {
  InjectionToken,
  isSignal,
  type Provider,
  type Signal,
} from '@angular/core';

/** Runtime/type brand carried by named reactive values exposed to templates. */
export const YIELDABLE_VALUE = Symbol('craft-yieldable-value');

/** Internal marker used by the synchronous Craft generator driver. */
export const REACTIVE_READ_REQUEST = Symbol('craft-reactive-read-request');

/** Internal escape hatch used by Craft itself to retain the raw Angular signal. */
export const RAW_REACTIVE_VALUE = Symbol('craft-raw-reactive-value');
const RAW_REACTIVE_ACTION = Symbol('craft-raw-reactive-action');

/** Type/runtime marker retaining the reader's resolved value type. */
export const REACTIVE_VALUE_TYPE = Symbol('craft-reactive-value-type');

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
> = NamedYieldableValue<
  Name,
  (() => Generator<ReactiveReadRequest<T>, T, unknown>) & {
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
export type YieldableReactiveProperties<Shape> =
  Shape extends YieldableReactiveValue<any, any>
    ? Shape
    : Shape extends Signal<any>
      ? YieldableReactiveSignal<Shape, string>
      : Shape extends (...args: any[]) => any
        ? Shape
        : Shape extends object
          ? {
              [Key in keyof Shape]: Shape[Key] extends Signal<any>
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
                        ) => YieldableReactiveProperties<ReturnType<Shape[Key]>>
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
export const REACTIVE_READ_OBSERVERS = new InjectionToken<
  readonly ReactiveReadObserver[]
>('REACTIVE_READ_OBSERVERS', {
  providedIn: 'root',
  factory: () => [],
});

export function provideReactiveReadObserver(
  observer: ReactiveReadObserver,
): Provider {
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

function createFacade(
  value: unknown,
  identity: ReactiveReadIdentity,
  path: string,
): unknown {
  if (typeof value !== 'object' && typeof value !== 'function') return value;
  if (isYieldableReactiveValue(value)) return value;

  const cacheKey = `${identity.primitive ?? ''}|${identity.computed ?? ''}|${path}`;
  const cachedByPath = facadeCache.get(value as object);
  if (cachedByPath?.has(cacheKey)) return cachedByPath.get(cacheKey);

  let facade: unknown;
  if (isSignal(value)) {
    const pathParts = path.split('.');
    const propertyName = pathParts[pathParts.length - 1] ?? identity.name;
    const reader = createYieldableReactiveValue(value, propertyName, {
      ...identity,
      path,
    });
    facade = new Proxy(reader, {
      get(_target, property) {
        if (property === YIELDABLE_VALUE || property === RAW_REACTIVE_VALUE) {
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
        return descriptor ? { ...descriptor, configurable: true } : undefined;
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
        if (!isSignal(child) && (typeof child !== 'object' || child === null)) {
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
        );
      },
    });
  }

  const nextCache = cachedByPath ?? new Map<string, unknown>();
  nextCache.set(cacheKey, facade);
  if (!cachedByPath) facadeCache.set(value as object, nextCache);
  return facade;
}
