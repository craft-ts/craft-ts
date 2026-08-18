import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { craftException, type AnyCraftException } from './craft-exception';
import {
  craftGen,
  isCraftGenShortCircuit,
  type CraftGenExceptionMarker,
  type ExtractCraftGenExceptions,
} from './craft-gen';
import { catchTag, retry, type CraftRetryPolicy } from './craft-program-operators';
import { isGuardAwaitRequest } from './craft-generator-runtime';

type GeneratorYielded<Gen> = Gen extends Generator<infer Yielded, any, any>
  ? Yielded
  : never;

type GeneratorReturn<Gen> = Gen extends Generator<any, infer Return, any>
  ? Return
  : never;

// Drives a program that only yields exception markers at the type level (no
// runtime service yields) to its settled outcome.
function drive<T>(program: Generator<unknown, T, unknown>): T {
  let current = program.next();
  while (!current.done) {
    current = program.next(undefined);
  }
  return current.value;
}

const flakyGuard = (outcomes: Array<'A' | 'B' | 'ok'>) => {
  let call = -1;
  return craftGen(function* () {
    call += 1;
    const outcome = outcomes[Math.min(call, outcomes.length - 1)];
    if (outcome === 'ok') return 'success' as const;
    return craftException({ _tag: outcome });
  });
};

describe('catchTag', () => {
  it('catches the matching code and returns the handler value', () => {
    const program = flakyGuard(['A'])().pipe(
      catchTag('A', function* () {
        return 'recovered' as const;
      }),
    );

    expect(drive(program)).toBe('recovered');
  });

  it('does not intercept a successful program', () => {
    const program = flakyGuard(['ok'])().pipe(
      catchTag('A', function* () {
        return 'recovered' as const;
      }),
    );

    expect(drive(program)).toBe('success');
  });

  it('rethrows a short-circuit with another code', () => {
    const program = flakyGuard(['B'])().pipe(
      catchTag('A', function* () {
        return 'recovered' as const;
      }),
    );

    try {
      drive(program);
      expect.unreachable('expected a short-circuit throw');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      if (isCraftGenShortCircuit(error)) {
        expect(error.exception.code).toBe('B');
      }
    }
  });

  it('receives the caught exception (code + payload)', () => {
    const failing = craftGen(function* () {
      return craftException({ _tag: 'A' }, { reason: 'expired' });
    });

    const seen: AnyCraftException[] = [];
    const program = failing().pipe(
      catchTag('A', function* (exception) {
        seen.push(exception as AnyCraftException);
        return 'recovered';
      }),
    );

    expect(drive(program)).toBe('recovered');
    expect(seen[0]?.code).toBe('A');
    expect(seen[0]?.payload).toEqual({ reason: 'expired' });
  });

  it('relays the handler yields to the driver', () => {
    const sentinel = { dependency: 'request' };
    const program = flakyGuard(['A'])().pipe(
      catchTag('A', function* () {
        const resolved = yield sentinel;
        return resolved;
      }),
    );

    expect(program.next()).toEqual({ value: sentinel, done: false });
    expect(program.next('resolved-value')).toEqual({
      value: 'resolved-value',
      done: true,
    });
  });

  it('re-enters the exception channel when the handler returns a craftException', () => {
    const program = flakyGuard(['A'])().pipe(
      catchTag('A', function* () {
        return craftException({ _tag: 'ESCALATED' });
      }),
    );

    try {
      drive(program);
      expect.unreachable('expected a short-circuit throw');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      if (isCraftGenShortCircuit(error)) {
        expect(error.exception.code).toBe('ESCALATED');
      }
    }
  });

  describe('exhaustive', () => {
    it('dispatches on the thrown code', () => {
      const program = flakyGuard(['B'])().pipe(
        catchTag.exhaustive({
          A: function* () {
            return 'fromA' as const;
          },
          B: function* () {
            return 'fromB' as const;
          },
        }),
      );

      expect(drive(program)).toBe('fromB');
    });

    it('rethrows a code outside the map (runtime safety net)', () => {
      const failing = craftGen(function* () {
        return craftException({ _tag: 'UNKNOWN' });
      });

      // Force an untyped program so the map cannot know about 'UNKNOWN'.
      const program = (
        failing as unknown as () => Generator<
          CraftGenExceptionMarker<AnyCraftException & { code: 'A' }>,
          unknown,
          unknown
        > & {
          pipe: (op: unknown) => Generator<unknown, unknown, unknown>;
        }
      )().pipe(
        catchTag.exhaustive({
          A: function* () {
            return 'fromA';
          },
        }),
      );

      expect(() => drive(program)).toThrow('UNKNOWN');
    });
  });
});

describe('retry', () => {
  it('replays the program until it succeeds', () => {
    const program = flakyGuard(['A', 'A', 'ok'])().pipe(retry({ times: 3 }));

    expect(drive(program)).toBe('success');
  });

  it('rethrows once times is exhausted', () => {
    const program = flakyGuard(['A', 'A', 'A', 'A'])().pipe(
      retry({ times: 2 }),
    );

    try {
      drive(program);
      expect.unreachable('expected a short-circuit throw');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      if (isCraftGenShortCircuit(error)) {
        expect(error.exception.code).toBe('A');
      }
    }
  });

  it('only retries the codes listed in while', () => {
    const program = flakyGuard(['B', 'ok'])().pipe(
      retry({ times: 3, while: ['A'] }),
    );

    expect(() => drive(program)).toThrow();
  });

  it('replays the upstream pipe chain (catchTag before retry)', () => {
    let handled = 0;
    const program = flakyGuard(['A', 'A', 'ok'])().pipe(
      catchTag('B', function* () {
        handled += 1;
        return 'fromB' as const;
      }),
      retry({ times: 3 }),
    );

    expect(drive(program)).toBe('success');
    expect(handled).toBe(0);
  });

  it('yields a promise await-request between attempts when a backoff is set', () => {
    vi.useFakeTimers();
    try {
      const program = flakyGuard(['A', 'ok'])().pipe(
        retry({ times: 2, delayMs: 50 }),
      );

      // First attempt fails -> the program suspends on the backoff delay.
      const suspended = program.next();
      expect(suspended.done).toBe(false);
      expect(isGuardAwaitRequest(suspended.value)).toBe(true);
      if (isGuardAwaitRequest(suspended.value)) {
        expect(suspended.value.kind).toBe('promise');
      }

      // Resume by hand (the async drivers await the request's promise).
      expect(program.next(undefined)).toEqual({
        value: 'success',
        done: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails fast on a bare generator without re-invocation capability', () => {
    // A craftGen invocation is re-invocable: retry replays then rethrows.
    const failing = craftGen(function* () {
      return craftException({ _tag: 'A' });
    });
    expect(() => drive(retry({ times: 1 })(failing()))).toThrow(
      'short-circuited',
    );

    // A hand-built generator that short-circuits cannot be replayed: the first
    // needed retry raises the explicit error.
    const shortCircuitingGuard = craftGen(function* () {
      return craftException({ _tag: 'A' });
    });
    const bareProgram = (function* () {
      return yield* shortCircuitingGuard();
    })();

    expect(() => drive(retry({ times: 1 })(bareProgram))).toThrow(
      're-invocable craft program',
    );
  });
});

describe('types', () => {
  const failing = craftGen(function* () {
    if (Math.random() > 0.66) return craftException({ _tag: 'A' }, { a: 1 });
    if (Math.random() > 0.33) return craftException({ _tag: 'B' }, { b: 2 });
    return 'value' as const;
  });

  it('catchTag removes the caught code from E and widens A', () => {
    const _program = failing().pipe(
      catchTag('A', function* () {
        return 'recovered' as const;
      }),
    );

    type Exceptions = ExtractCraftGenExceptions<
      GeneratorYielded<typeof _program>
    >;

    expectTypeOf<Exceptions['_tag']>().toEqualTypeOf<'B'>();
    expectTypeOf<GeneratorReturn<typeof _program>>().toEqualTypeOf<
      'value' | 'recovered'
    >();
  });

  it('catchTag adds the handler own exceptions to E', () => {
    const _program = failing().pipe(
      catchTag('A', function* () {
        return craftException({ _tag: 'ESCALATED' });
      }),
    );

    type Exceptions = ExtractCraftGenExceptions<
      GeneratorYielded<typeof _program>
    >;

    expectTypeOf<Exceptions['_tag']>().toEqualTypeOf<'B' | 'ESCALATED'>();
  });

  it('catchTag relays the handler dependency yields into Yielded', () => {
    const dependencyGuard = craftGen(function* () {
      const resolved = yield { some: 'service-request' } as const;
      return resolved;
    });

    const _program = failing().pipe(
      catchTag('A', function* () {
        return yield* dependencyGuard();
      }),
    );

    type NonMarkerYields = Exclude<
      GeneratorYielded<typeof _program>,
      CraftGenExceptionMarker<any>
    >;

    expectTypeOf<{ readonly some: 'service-request' }>().toExtend<NonMarkerYields>();
  });

  it('catchTag.exhaustive covering every code empties E', () => {
    const _program = failing().pipe(
      catchTag.exhaustive({
        A: function* () {
          return 'fromA' as const;
        },
        B: function* () {
          return 'fromB' as const;
        },
      }),
    );

    type Exceptions = ExtractCraftGenExceptions<
      GeneratorYielded<typeof _program>
    >;

    expectTypeOf<Exceptions>().toEqualTypeOf<never>();
    expectTypeOf<GeneratorReturn<typeof _program>>().toEqualTypeOf<
      'value' | 'fromA' | 'fromB'
    >();
  });

  it('catchTag.exhaustive rejects an incomplete map', () => {
    failing().pipe(
      // @ts-expect-error — missing handler for code 'B'
      catchTag.exhaustive({
        A: function* () {
          return 'fromA' as const;
        },
      }),
    );
  });

  it('catchTag.exhaustive rejects an extra handler', () => {
    failing().pipe(
      // @ts-expect-error — 'C' is not a reachable code
      catchTag.exhaustive({
        A: function* () {
          return 'fromA' as const;
        },
        B: function* () {
          return 'fromB' as const;
        },
        C: function* () {
          return 'fromC' as const;
        },
      }),
    );
  });

  it('retry preserves E and A', () => {
    const policy: CraftRetryPolicy = { times: 2, backoff: 'linear', delayMs: 10 };
    const _program = failing().pipe(retry(policy));

    type Exceptions = ExtractCraftGenExceptions<
      GeneratorYielded<typeof _program>
    >;

    expectTypeOf<Exceptions['_tag']>().toEqualTypeOf<'A' | 'B'>();
    expectTypeOf<GeneratorReturn<typeof _program>>().toEqualTypeOf<'value'>();
  });
});
