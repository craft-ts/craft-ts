import { describe, expect, expectTypeOf, it } from 'vitest';
import { craftException, type CraftException } from './craft-exception';
import {
  craftGen,
  CraftGenShortCircuit,
  isCraftGenShortCircuit,
  type CraftGenExceptionMarker,
  type ExtractCraftGenExceptions,
} from './craft-gen';

type GeneratorYielded<Gen> = Gen extends () => Generator<infer Yielded, any, any>
  ? Yielded
  : never;

describe('craftGen', () => {
  it('propagates the success value through yield*', () => {
    const okGuard = craftGen(() =>
      function* () {
        return true;
      },
    );

    const composed = function* () {
      const result = yield* okGuard();
      return result;
    };

    expect(composed().next()).toEqual({ value: true, done: true });
  });

  it('short-circuits the enclosing generator when a guard returns a craftException', () => {
    const failGuard = craftGen(() =>
      function* () {
        return craftException({ code: 'FORBIDDEN' });
      },
    );

    let reachedAfterGuard = false;
    const composed = function* () {
      yield* failGuard();
      reachedAfterGuard = true;
      return true;
    };

    const iterator = composed();

    expect(() => iterator.next()).toThrow(CraftGenShortCircuit);
    expect(reachedAfterGuard).toBe(false);
  });

  it('exposes the produced exception on the short-circuit marker', () => {
    const failGuard = craftGen(() =>
      function* () {
        return craftException({ code: 'FORBIDDEN' }, { reason: 'role' });
      },
    );

    const composed = function* () {
      yield* failGuard();
      return true;
    };

    try {
      composed().next();
      expect.unreachable('expected a short-circuit throw');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      if (isCraftGenShortCircuit(error)) {
        expect(error.exception.code).toBe('FORBIDDEN');
        expect(error.exception.payload).toEqual({ reason: 'role' });
      }
    }
  });

  it('relays the inner generator dependency yields to the driver', () => {
    const sentinel = { dependency: 'request' };
    const depGuard = craftGen(() =>
      function* () {
        const resolved = yield sentinel;
        return resolved;
      },
    );

    const composed = function* () {
      const resolved = yield* depGuard();
      return resolved;
    };

    const iterator = composed();

    expect(iterator.next()).toEqual({ value: sentinel, done: false });
    expect(iterator.next('resolved-value')).toEqual({
      value: 'resolved-value',
      done: true,
    });
  });

  it('forwards factory arguments to the inner generator factory', () => {
    const roleGuard = craftGen((...roles: string[]) =>
      function* () {
        return roles.includes('admin')
          ? true
          : craftException({ code: 'FORBIDDEN_ROLE' });
      },
    );

    const allowed = function* () {
      return yield* roleGuard('admin');
    };
    expect(allowed().next()).toEqual({ value: true, done: true });

    const denied = function* () {
      yield* roleGuard('user');
      return true;
    };
    expect(() => denied().next()).toThrow(CraftGenShortCircuit);
  });

  describe('types', () => {
    it('strips the exception from the invocation success value', () => {
      const roleGuard = craftGen((role: string) =>
        function* () {
          return role === 'x'
            ? craftException({ code: 'FORBIDDEN' })
            : (true as const);
        },
      );

      // The invocation's return value has the exception stripped to its success.
      type InvocationReturn =
        ReturnType<typeof roleGuard> extends Generator<any, infer R, any>
          ? R
          : never;
      expectTypeOf<InvocationReturn>().toEqualTypeOf<true>();

      // The `yield*` result is the success value with the exception stripped.
      const composed = function* () {
        const value = yield* roleGuard('a');
        return value;
      };

      expectTypeOf<
        ReturnType<typeof composed> extends Generator<any, infer R, any>
          ? R
          : never
      >().toEqualTypeOf<true>();
    });

    it('advertises the reachable exception codes on the invocation Yielded', () => {
      const roleGuard = craftGen(() =>
        function* () {
          if (Math.random() > 0.5) return craftException({ code: 'A' });
          return craftException({ code: 'B' });
        },
      );

      const composed = function* () {
        yield* roleGuard();
        return true;
      };

      type Exceptions = ExtractCraftGenExceptions<
        GeneratorYielded<typeof composed>
      >;

      expectTypeOf<Exceptions['code']>().toEqualTypeOf<'A' | 'B'>();
    });

    it('keeps the exception marker distinct from arbitrary yields', () => {
      type Yielded =
        | { some: 'service-request' }
        | CraftGenExceptionMarker<CraftException<{ code: 'X'; scope: undefined }>>;

      type Exceptions = ExtractCraftGenExceptions<Yielded>;

      expectTypeOf<Exceptions['code']>().toEqualTypeOf<'X'>();
    });
  });
});
