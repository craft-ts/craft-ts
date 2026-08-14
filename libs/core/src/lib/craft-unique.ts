export const CRAFT_UNIQUE = Symbol('craftUnique');

export type CraftUnique<T> = T & {
  readonly [CRAFT_UNIQUE]: true;
};

export function craftUnique<const T>(value: T): CraftUnique<T> {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    Object.defineProperty(value, CRAFT_UNIQUE, {
      value: true,
      enumerable: false,
      configurable: false,
    });
  }
  return value as CraftUnique<T>;
}

export function isCraftUnique(value: unknown): value is CraftUnique<unknown> {
  return (
    (typeof value === 'object' && value !== null && CRAFT_UNIQUE in value) ||
    (typeof value === 'function' && CRAFT_UNIQUE in value)
  );
}
