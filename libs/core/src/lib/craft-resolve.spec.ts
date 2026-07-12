import { describe, expect, it } from 'vitest';
import { craftResolve } from './craft-resolve';

describe('craftResolve', () => {
  it('returns the same generator function unchanged (identity at runtime)', () => {
    function* resolveFn(): Generator<unknown, { profile: number }, unknown> {
      return { profile: 42 };
    }

    const wrapped = craftResolve(resolveFn);
    expect(wrapped).toBe(resolveFn as unknown as typeof wrapped);
  });

  it('the returned function still drives as a generator producing the same result', () => {
    function* resolveFn(): Generator<unknown, { profile: number }, unknown> {
      return { profile: 42 };
    }

    const wrapped = craftResolve(resolveFn);
    const iterator = wrapped(
      {} as never,
      {} as never,
    );
    const result = iterator.next();
    expect(result).toEqual({ done: true, value: { profile: 42 } });
  });

  it('preserves yields from the original generator body', () => {
    function* resolveFn(): Generator<string, number, unknown> {
      const received = (yield 'yielded-value') as unknown;
      return received === 'resumed' ? 1 : 0;
    }

    const wrapped = craftResolve(resolveFn);
    const iterator = wrapped({} as never, {} as never);
    const first = iterator.next();
    expect(first).toEqual({ done: false, value: 'yielded-value' });
    const second = iterator.next('resumed' as never);
    expect(second).toEqual({ done: true, value: 1 });
  });
});
