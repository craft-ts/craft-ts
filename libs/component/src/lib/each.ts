import type {
  CraftNodeChildren,
  EachNode,
} from './render/vnode';

export interface EachOptions<Item, Key> {
  readonly track: (item: Item, index: number) => Key;
  readonly empty?: () => CraftNodeChildren;
}

export function each<Item, Key>(
  source: readonly Item[] | (() => readonly Item[]),
  options: EachOptions<Item, Key>,
  itemTemplate: (item: Item, index: number) => CraftNodeChildren,
): EachNode<Item, Key> {
  return {
    kind: 'each',
    source,
    track: options.track,
    empty: options.empty,
    itemTemplate,
  };
}
