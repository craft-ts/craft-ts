import type {
  CraftNodeChildrenDependencies,
  CraftNodeChildren,
  ForNode,
} from './render/vnode';
import { pipeCraftNode } from './render/vnode';
import type { InputValue } from './types';
import { YIELDABLE_VALUE } from '@craft-ts/core';

export interface ForOptions<Item, Key> {
  readonly track: (item: Item, index: number) => Key;
  readonly empty?: () => CraftNodeChildren;
}

type CallbackDependencies<Callback> = Callback extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenDependencies<Output>
  : {};

type EmptyDependencies<Options> = Options extends {
  readonly empty?: infer Empty;
}
  ? CallbackDependencies<NonNullable<Empty>>
  : {};

type SourceName<Source> = Source extends {
  readonly [YIELDABLE_VALUE]: infer Name extends string;
}
  ? Name
  : undefined;

type ForSource =
  | readonly unknown[]
  | null
  | undefined
  | (() => readonly unknown[] | null | undefined)
  | Generator<unknown, readonly unknown[] | null | undefined, unknown>
  | (() => Generator<unknown, readonly unknown[] | null | undefined, unknown>);

type ForItemFromValue<Value> = [NonNullable<Value>] extends [never]
  ? never
  : NonNullable<Value> extends (...args: any[]) => infer Result
    ? ForItemFromValue<Result>
    : NonNullable<Value> extends Generator<any, infer Result, any>
      ? ForItemFromValue<Result>
      : NonNullable<Value> extends readonly (infer Item)[]
        ? Item
        : never;

type ForItem<Source> = [NonNullable<Source>] extends [never]
  ? unknown
  : ForItemFromValue<Source>;

type ForItemInput<Source> = InputValue<ForItem<Source>>;

export function forNode<
  Name extends string,
  Source extends ForSource,
  Key,
  Options extends ForOptions<NoInfer<ForItem<Source>>, Key>,
  ItemTemplate extends (
    item: NoInfer<ForItemInput<Source>>,
    index: number,
  ) => CraftNodeChildren,
>(
  source: Source & { readonly [YIELDABLE_VALUE]: Name },
  options: Options,
  itemTemplate: ItemTemplate,
): ForNode<
  ForItem<Source>,
  Key,
  CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>,
  Name,
  ReturnType<ItemTemplate>,
  Options extends { readonly empty?: (...args: any[]) => infer Empty }
    ? Empty
    : never
>;

export function forNode<
  Source extends ForSource,
  Key,
  Options extends ForOptions<NoInfer<ForItem<Source>>, Key>,
  ItemTemplate extends (
    item: NoInfer<ForItemInput<Source>>,
    index: number,
  ) => CraftNodeChildren,
>(
  source: Source & ForSource,
  options: Options,
  itemTemplate: ItemTemplate,
): ForNode<
  ForItem<Source>,
  Key,
  CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>,
  SourceName<Source>,
  ReturnType<ItemTemplate>,
  Options extends { readonly empty?: (...args: any[]) => infer Empty }
    ? Empty
    : never
>;

export function forNode<
  Source extends ForSource,
  Key,
  Options extends ForOptions<ForItem<Source>, Key>,
  ItemTemplate extends (
    item: ForItemInput<Source>,
    index: number,
  ) => CraftNodeChildren,
>(
  source: Source & ForSource,
  options: Options,
  itemTemplate: ItemTemplate,
): ForNode<
  ForItem<Source>,
  Key,
  CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>,
  SourceName<Source>,
  ReturnType<ItemTemplate>,
  Options extends { readonly empty?: (...args: any[]) => infer Empty }
    ? Empty
    : never
> {
  const sourceName =
    typeof source === 'function' &&
    typeof (source as { readonly [YIELDABLE_VALUE]?: unknown })[
      YIELDABLE_VALUE
    ] === 'string'
      ? (source as unknown as { readonly [YIELDABLE_VALUE]: string })[
          YIELDABLE_VALUE
        ]
      : undefined;

  const node = {
    kind: 'for' as const,
    source: source as ForNode<ForItem<Source>, Key>['source'],
    sourceName: sourceName as SourceName<Source> | undefined,
    track: options.track,
    empty: options.empty as
      | (() => Options extends {
          readonly empty?: (...args: any[]) => infer Empty;
        }
          ? Empty
          : never)
      | undefined,
    itemTemplate: itemTemplate as unknown as (
      item: ForItemInput<Source>,
      index: number,
    ) => ReturnType<ItemTemplate>,
  };
  Object.defineProperty(node, 'pipe', {
    value: (directive: unknown) =>
      pipeCraftNode(node as unknown as ForNode, directive as never),
    enumerable: false,
  });

  return node as unknown as ForNode<
    ForItem<Source>,
    Key,
    CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>,
    SourceName<Source>,
    ReturnType<ItemTemplate>,
    Options extends { readonly empty?: (...args: any[]) => infer Empty }
      ? Empty
      : never
  >;
}

export type { ScheduleForDirective } from './for-scheduling';
export {
  FOR_SCHEDULER,
  FrameForScheduler,
  SyncForScheduler,
  createForScheduler,
  scheduleFor,
} from './for-scheduling';
