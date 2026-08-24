import type {
  AnyCraftException,
  YieldableReactiveValue,
} from '@craft-ts/core';
import { craftUse } from '@craft-ts/core';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  MatchNode,
} from './render/vnode';

type ExceptionCode<Value extends object, Key extends keyof Value> = Extract<
  Value[Key],
  string | number
>;

type ExceptionHandlerMap<Value extends object, Key extends keyof Value> = {
  [Code in ExceptionCode<Value, Key>]: (
    exception: Extract<Value, Record<Key, Code>>,
  ) => CraftNodeChildren;
};

type MatchDependencies<Handlers> =
  Handlers extends Record<string, (...args: any[]) => infer Output>
    ? CraftNodeChildrenDependencies<Output>
    : Record<never, never>;

type ExceptionKey<Value extends object> = {
  [K in keyof Value]-?: Value[K] extends string | number ? K : never;
}[keyof Value];

type ScalarValue = string | number;

type ScalarHandlerMap<Value extends ScalarValue> = {
  [Code in Extract<Value, string | number>]: () => CraftNodeChildren;
};

type GeneratorSourceValue<Source> = Source extends (
  ...args: any[]
) => Generator<any, infer Value, any>
  ? Exclude<Value, undefined> extends infer ObjectValue extends object
    ? ObjectValue
    : never
  : never;

/**
 * Template-projected deep readers are generator callbacks rather than the
 * original `YieldableReactiveValue` type. Keep their result type available to
 * discriminated-union matching without importing the component template
 * layer into core's component primitives.
 */
function exhaustive<
  Source extends ((...args: any[]) => Generator<any, any, any>) | undefined,
  Value extends object = GeneratorSourceValue<Source>,
  Key extends ExceptionKey<Value> = ExceptionKey<Value>,
  Handlers extends ExceptionHandlerMap<Value, Key> = ExceptionHandlerMap<
    Value,
    Key
  >,
>(
  source: Source,
  key: Key,
  handlers: Handlers,
): MatchNode<
  MatchDependencies<Handlers>,
  NonNullable<Source>,
  ReturnType<Handlers[ExceptionCode<Value, Key>]>,
  Extract<ExceptionCode<Value, Key>, string>
>;

function exhaustive<
  Value extends object,
  Key extends ExceptionKey<Value>,
  Handlers extends ExceptionHandlerMap<Value, Key>,
>(
  source: YieldableReactiveValue<Value>,
  key: Key,
  handlers: Handlers,
): MatchNode<
  MatchDependencies<Handlers>,
  YieldableReactiveValue<Value>,
  ReturnType<Handlers[ExceptionCode<Value, Key>]>,
  Extract<ExceptionCode<Value, Key>, string>
>;
function exhaustive<
  Value extends object,
  Key extends ExceptionKey<Value>,
  Handlers extends ExceptionHandlerMap<Value, Key>,
>(
  source: (() => Value | undefined) | Value,
  key: Key,
  handlers: Handlers,
): MatchNode<
  MatchDependencies<Handlers>,
  (() => Value | undefined) | Value,
  ReturnType<Handlers[ExceptionCode<Value, Key>]>,
  Extract<ExceptionCode<Value, Key>, string>
>;
function exhaustive<
  Value extends ScalarValue,
  Handlers extends ScalarHandlerMap<Value>,
>(
  source: YieldableReactiveValue<Value>,
  handlers: Handlers,
): MatchNode<
  MatchDependencies<Handlers>,
  YieldableReactiveValue<{ value: Value }>,
  ReturnType<Handlers[Extract<Value, string | number>]>,
  Extract<Value, string>
>;
function exhaustive<
  Value extends ScalarValue,
  Handlers extends ScalarHandlerMap<Value>,
>(
  source: (() => Value | Generator<unknown, Value, unknown>) | Value,
  handlers: Handlers,
): MatchNode<
  MatchDependencies<Handlers>,
  (() => { value: Value }) | { value: Value },
  ReturnType<Handlers[Extract<Value, string | number>]>,
  Extract<Value, string>
>;
function exhaustive(
  source: unknown,
  keyOrHandlers: PropertyKey | Record<string, () => CraftNodeChildren>,
  maybeHandlers?: Record<
    string,
    (exception: AnyCraftException) => CraftNodeChildren
  >,
) {
  if (maybeHandlers === undefined) {
    const handlers = keyOrHandlers as Record<
      string,
      () => CraftNodeChildren
    >;
    const scalarSource =
      typeof source === 'function'
        ? () => ({
            value: craftUse((source as () => unknown)()) as ScalarValue,
          })
        : { value: source };

    return {
      kind: 'match' as const,
      source: scalarSource,
      key: 'value',
      handlers: Object.fromEntries(
        Object.entries(handlers).map(([code, handler]) => [
          code,
          () => handler(),
        ]),
      ),
    };
  }

  return {
    kind: 'match' as const,
    source,
    key: keyOrHandlers,
    handlers: maybeHandlers,
  };
}

/** Reactive template counterpart of discriminated-union matching. */
export const matchNode = { exhaustive };
