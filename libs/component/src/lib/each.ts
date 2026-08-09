import type {
  CraftNodeChildrenDependencies,
  CraftNodeChildren,
  EachNode,
} from './render/vnode';
import { YIELDABLE_VALUE } from '@craft-ng/core';

export interface EachOptions<Item, Key> {
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

type EachSource =
  | readonly unknown[]
  | null
  | undefined
  | (() => readonly unknown[] | null | undefined)
  | Generator<unknown, readonly unknown[] | null | undefined, unknown>
  | (() => Generator<unknown, readonly unknown[] | null | undefined, unknown>);

type EachItemFromValue<Value> = [NonNullable<Value>] extends [
  readonly (infer Item)[],
]
  ? Item
  : [NonNullable<Value>] extends [
        Generator<unknown, infer Result, unknown>,
      ]
    ? EachItemFromValue<Result>
    : never;

type EachItem<Source> = [NonNullable<Source>] extends [never]
  ? unknown
  : NonNullable<Source> extends (...args: never[]) => infer Value
    ? EachItemFromValue<Value>
    : EachItemFromValue<Source>;

export function each<
  Name extends string,
  Source extends EachSource,
  Key,
  Options extends EachOptions<NoInfer<EachItem<Source>>, Key>,
  ItemTemplate extends (
    item: NoInfer<EachItem<Source>>,
    index: number,
  ) => CraftNodeChildren,
>(
  source: Source & { readonly [YIELDABLE_VALUE]: Name },
  options: Options,
  itemTemplate: ItemTemplate,
): EachNode<
  EachItem<Source>,
  Key,
  CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>,
  Name,
  ReturnType<ItemTemplate>,
  Options extends { readonly empty?: (...args: any[]) => infer Empty }
    ? Empty
    : never
>;

export function each<
  Source extends EachSource,
  Key,
  Options extends EachOptions<NoInfer<EachItem<Source>>, Key>,
  ItemTemplate extends (
    item: NoInfer<EachItem<Source>>,
    index: number,
  ) => CraftNodeChildren,
>(
  source: Source & EachSource,
  options: Options,
  itemTemplate: ItemTemplate,
): EachNode<
  EachItem<Source>,
  Key,
  CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>,
  SourceName<Source>,
  ReturnType<ItemTemplate>,
  Options extends { readonly empty?: (...args: any[]) => infer Empty }
    ? Empty
    : never
>;

export function each<
  Source extends EachSource,
  Key,
  Options extends EachOptions<EachItem<Source>, Key>,
  ItemTemplate extends (
    item: EachItem<Source>,
    index: number,
  ) => CraftNodeChildren,
>(
  source: Source & EachSource,
  options: Options,
  itemTemplate: ItemTemplate,
): EachNode<
  EachItem<Source>,
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

  return {
    kind: 'each',
    source: source as EachNode<EachItem<Source>, Key>['source'],
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
      item: EachItem<Source>,
      index: number,
    ) => ReturnType<ItemTemplate>,
  };
}
