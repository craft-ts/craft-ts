import type { AnyCraftException } from '@craft-ng/core';
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

type MatchSource<Value extends object> = (() => Value | undefined) | Value;

type MatchBlockDependencies<Handlers> =
  Handlers extends Record<string, (...args: any[]) => infer Output>
    ? CraftNodeChildrenDependencies<Output>
    : {};

/** Reactive template counterpart of discriminated-union matching. */
export const matchBlock = {
  exhaustive<
    Value extends object,
    Key extends {
      [K in keyof Value]-?: Value[K] extends string | number ? K : never;
    }[keyof Value],
    Handlers extends ExceptionHandlerMap<Value, Key>,
  >(
    source: MatchSource<Value>,
    key: Key,
    handlers: Handlers,
  ): MatchBlockNode<
    MatchBlockDependencies<Handlers>,
    () => Value | undefined,
    ReturnType<Handlers[ExceptionCode<Value, Key>]>
  > {
    const read = (): Value | undefined =>
      typeof source === 'function'
        ? (source as () => Value | undefined)()
        : (source as Value);

    return {
      kind: 'match-block',
      source: read,
      key,
      handlers: handlers as unknown as Record<
        string,
        (exception: AnyCraftException) => CraftNodeChildren
      >,
    } as MatchBlockNode<
      MatchBlockDependencies<Handlers>,
      () => Value | undefined,
      ReturnType<Handlers[ExceptionCode<Value, Key>]>
    >;
  },
};
