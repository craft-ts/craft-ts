const hydrationKeys = new WeakMap<object, string>();

export function setNodeHydrationKey(node: object, key: string): void {
  hydrationKeys.set(node, key);
}

export function hydrationKeyOf(node: object): string | undefined {
  return hydrationKeys.get(node);
}
