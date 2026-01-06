export const __INTERNAL_QueryBrand: unique symbol = Symbol(
  '__INTERNAL_QueryBrand'
);

export type HasQueryBrand<T> = typeof __INTERNAL_QueryBrand extends keyof T
  ? true
  : false;

export function brandQueryFunction<F extends (...args: any[]) => any>(
  fn: F
): F & { [__INTERNAL_QueryBrand]: true } {
  // Attach a non-enumerable brand if you prefer DefineProperty; Object.assign is fine too
  return Object.assign(fn, { [__INTERNAL_QueryBrand]: true as const });
}

export function isBrandQueryFn(fn: unknown): boolean {
  return (
    typeof fn === 'function' && (fn as any)[__INTERNAL_QueryBrand] === true
  );
}
