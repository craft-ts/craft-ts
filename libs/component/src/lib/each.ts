import type {
  CraftNodeChildrenDependencies,
  CraftNodeChildren,
  EachNode,
} from './render/vnode';

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

export function each<
  Item,
  Key,
  Options extends EachOptions<Item, Key>,
  ItemTemplate extends (item: Item, index: number) => CraftNodeChildren,
>(
  source: readonly Item[] | (() => readonly Item[]),
  options: Options,
  itemTemplate: ItemTemplate,
): EachNode<
  Item,
  Key,
  CallbackDependencies<ItemTemplate> | EmptyDependencies<Options>
> {
  return {
    kind: 'each',
    source,
    track: options.track,
    empty: options.empty,
    itemTemplate,
  };
}
