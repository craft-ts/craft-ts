import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CRAFT_UNIQUE,
  craftUnique,
  isCraftUnique,
  type CraftUnique,
} from './craft-unique';

describe('craftUnique', () => {
  it('brands an object without changing its fields', () => {
    const value = craftUnique({ storeName: 'y', key: 'x' });

    expect(value).toEqual({ storeName: 'y', key: 'x' });
    expect(isCraftUnique(value)).toBe(true);
    expect(value[CRAFT_UNIQUE]).toBe(true);
    expectTypeOf(value).toEqualTypeOf<
      CraftUnique<{ readonly storeName: 'y'; readonly key: 'x' }>
    >();
  });

  it('brands a string without wrapping it', () => {
    const value = craftUnique('get99');

    expect(value).toBe('get99');
    expect(isCraftUnique(value)).toBe(false);
    expectTypeOf(value).toEqualTypeOf<CraftUnique<'get99'>>();
  });
});
