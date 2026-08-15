import type {
  AnyCraftException,
  YieldableReactiveValue,
} from '@craft-ng/core';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  MatchBlockNode,
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

type MatchBlockDependencies<Handlers> =
  Handlers extends Record<string, (...args: any[]) => infer Output>
    ? CraftNodeChildrenDependencies<Output>
    : {};

type ExceptionKey<Value extends object> = {
  [K in keyof Value]-?: Value[K] extends string | number ? K : never;
}[keyof Value];

function exhaustive<
  Value extends object,
  Key extends ExceptionKey<Value>,
  Handlers extends ExceptionHandlerMap<Value, Key>,
>(
  source: YieldableReactiveValue<Value>,
  key: Key,
  handlers: Handlers,
): MatchBlockNode<
  MatchBlockDependencies<Handlers>,
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
): MatchBlockNode<
  MatchBlockDependencies<Handlers>,
  (() => Value | undefined) | Value,
  ReturnType<Handlers[ExceptionCode<Value, Key>]>,
  Extract<ExceptionCode<Value, Key>, string>
>;
function exhaustive(
  source: unknown,
  key: PropertyKey,
  handlers: Record<string, (exception: AnyCraftException) => CraftNodeChildren>,
) {
  return {
    kind: 'match-block' as const,
    source,
    key,
    handlers,
  };
}

/** Reactive template counterpart of discriminated-union matching. */
export const matchBlock = { exhaustive };
