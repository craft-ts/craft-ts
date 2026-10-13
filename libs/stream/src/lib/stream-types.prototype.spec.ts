import { describe, expectTypeOf, it } from 'vitest';
import type {
  CompleteServiceDependencyMapFromYielded,
  CraftException,
  CraftGenExceptionMarker,
  ServiceDependencies,
  ServiceTrackedDepsRequest,
} from '@craft-ts/core';
import type { CraftStream, StreamExceptions } from '../index';
import { catchTag, filter, map, mapException, take, tap } from '../index';

// ---------------------------------------------------------------------------
// Wave 0 spike — typing go/no-go for `CraftStream<A, Y>`.
//
// Criteria:
//  (1) `A` is inferred across the pipe slots 1..10;
//  (2) five distinct service dependencies accumulate without subtype reduction;
//  (3) exceptions union up, `catchTag` removes one and types its handler, and
//      `.exhaustive` reports missing / unreachable codes readably;
//  (4) computing the terminal's view at N=10 stays inside the budget — measured
//      by `tools/stream-typecost/run.mjs`, not here.
// ---------------------------------------------------------------------------

type NotFound = CraftException<
  { _tag: 'NotFound'; scope: undefined },
  { id: number }
>;
type Forbidden = CraftException<
  { _tag: 'Forbidden'; scope: undefined },
  { role: string }
>;
type Timeout = CraftException<
  { _tag: 'Timeout'; scope: undefined },
  { ms: number }
>;
type Offline = CraftException<{ _tag: 'Offline'; scope: undefined }, undefined>;
type Quota = CraftException<
  { _tag: 'Quota'; scope: undefined },
  { left: number }
>;

type Dep<Name extends string> = ServiceTrackedDepsRequest<{
  [K in Name]: ServiceDependencies<'function', object>;
}>;
type Raises<E> = CraftGenExceptionMarker<E>;

declare const base: CraftStream<number>;
declare const withNotFound: CraftStream<number, Raises<NotFound>>;
declare const withTwo: CraftStream<number, Raises<NotFound | Forbidden>>;

/** Adds a dependency and an exception to whatever stream it is piped onto. */
declare function adding<Name extends string, E>(
  name: Name,
  exception?: E,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | Dep<Name> | Raises<E>>;

type DepNames<S> =
  S extends CraftStream<any, infer Y>
    ? keyof CompleteServiceDependencyMapFromYielded<Y>
    : never;

describe('spike (1): A is inferred across the pipe slots', () => {
  it('types the callback parameter of every operator from the previous slot', () => {
    const out = base.pipe(
      map((a) => {
        expectTypeOf(a).toEqualTypeOf<number>();
        return `${a}`;
      }),
      map((b) => {
        expectTypeOf(b).toEqualTypeOf<string>();
        return b.length;
      }),
      filter((c) => {
        expectTypeOf(c).toEqualTypeOf<number>();
        return c > 0;
      }),
      map((d) => [d] as const),
      map((e) => {
        expectTypeOf(e).toEqualTypeOf<readonly [number]>();
        return e[0] > 1;
      }),
      tap((f) => {
        expectTypeOf(f).toEqualTypeOf<boolean>();
      }),
      map((g) => (g ? 'yes' : 'no')),
      take(5),
      map((h) => {
        expectTypeOf(h).toEqualTypeOf<'yes' | 'no'>();
        return h.length;
      }),
      map((i) => {
        expectTypeOf(i).toEqualTypeOf<number>();
        return { n: i };
      }),
    );
    expectTypeOf(out).toEqualTypeOf<CraftStream<{ n: number }, never>>();
  });

  it('narrows through a type-guard filter', () => {
    const mixed = {} as CraftStream<number | string>;
    const out = mixed.pipe(filter((v): v is string => typeof v === 'string'));
    expectTypeOf(out).toEqualTypeOf<CraftStream<string, never>>();
  });

  it('keeps inference past the tenth slot through a nested pipe', () => {
    const first = base.pipe(map((a) => a + 1));
    const out = first.pipe(map((a) => `${a}`));
    expectTypeOf(out).toEqualTypeOf<CraftStream<string, never>>();
  });
});

describe('spike (2): dependencies accumulate without reduction', () => {
  it('keeps five distinct service dependencies', () => {
    const out = base.pipe(
      adding('A'),
      map((v) => v + 1),
      adding('B'),
      filter((v) => v > 0),
      adding('C'),
      take(10),
      adding('D'),
      tap(() => undefined),
      adding('E'),
    );
    void out;
    expectTypeOf<DepNames<typeof out>>().toEqualTypeOf<
      'A' | 'B' | 'C' | 'D' | 'E'
    >();
  });

  it('keeps a dependency-free stream dependency-free', () => {
    const out = base.pipe(map((v) => v + 1));
    void out;
    expectTypeOf<DepNames<typeof out>>().toEqualTypeOf<never>();
  });
});

describe('spike (3): exceptions travel and are caught by tag', () => {
  it('unions the exceptions each operator may add', () => {
    const out = base.pipe(
      adding('A', undefined as unknown as NotFound),
      map((v) => v + 1),
      adding('B', undefined as unknown as Forbidden),
      adding('C', undefined as unknown as Timeout),
    );
    void out;
    expectTypeOf<
      StreamExceptions<typeof out extends CraftStream<any, infer Y> ? Y : never>
    >().toEqualTypeOf<NotFound | Forbidden | Timeout>();
  });

  it('removes the caught tag, types the handler, and widens the value', () => {
    const out = withTwo.pipe(
      catchTag('NotFound', (e) => {
        expectTypeOf(e).toEqualTypeOf<NotFound>();
        return 'fallback' as const;
      }),
    );
    expectTypeOf(out).toEqualTypeOf<
      CraftStream<number | 'fallback', Raises<Forbidden>>
    >();
  });

  it('clears the exception channel once the last tag is caught', () => {
    const out = withNotFound.pipe(catchTag('NotFound', () => 0));
    expectTypeOf(out).toEqualTypeOf<CraftStream<number, never>>();
  });

  it('rejects a tag the stream cannot produce', () => {
    withNotFound.pipe(
      // @ts-expect-error 'Forbidden' is not an exception of this stream
      catchTag('Forbidden', () => 0),
    );
  });

  it('lets the handler itself raise a new exception', () => {
    const out = withNotFound.pipe(
      catchTag('NotFound', () => undefined as unknown as Offline),
    );
    expectTypeOf(out).toEqualTypeOf<CraftStream<number, Raises<Offline>>>();
  });

  it('rewrites exceptions through mapException', () => {
    const out = withTwo.pipe(
      mapException((e) => {
        expectTypeOf(e).toEqualTypeOf<NotFound | Forbidden>();
        return undefined as unknown as Quota;
      }),
    );
    expectTypeOf(out).toEqualTypeOf<CraftStream<number, Raises<Quota>>>();
  });

  it('checks .exhaustive: complete maps pass, missing and unreachable codes do not', () => {
    const ok = withTwo.pipe(
      catchTag.exhaustive({
        NotFound: (e) => {
          expectTypeOf(e).toEqualTypeOf<NotFound>();
          return 0;
        },
        Forbidden: () => 1,
      }),
    );
    expectTypeOf(ok).toEqualTypeOf<CraftStream<number, never>>();

    withTwo.pipe(
      // @ts-expect-error `Forbidden` has no handler
      catchTag.exhaustive({ NotFound: () => 0 }),
    );

    withNotFound.pipe(
      // @ts-expect-error `Quota` is unreachable
      catchTag.exhaustive({ NotFound: () => 0, Quota: () => 1 }),
    );
  });
});
