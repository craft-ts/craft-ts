/* eslint-disable @typescript-eslint/no-unused-vars -- typing-only spec: values exist to be inspected through `typeof`. */
import { describe, expectTypeOf, it } from 'vitest';
import type {
  CompleteServiceDependencyMapFromYielded,
  CraftException,
  CraftGenExceptionMarker,
  RuntimeTemporalAwaitRequest,
  ServiceDependencies,
  ServiceTrackedDepsRequest,
} from '@craft-ts/core';
import type {
  CraftStream,
  StreamExceptions,
  StreamTimeoutException,
} from '../index';
import {
  bufferCount,
  catchTag,
  combineLatest,
  concatMap,
  debounce,
  delay,
  groupBy,
  merge,
  mergeMap,
  pairwise,
  race,
  repeat,
  retry,
  switchMap,
  timeout,
  withLatestFrom,
  zip,
} from '../index';

// Wave 3 typing: flattening, combination and time operators carry the
// dependencies and exceptions of every stream they touch.

type NotFound = CraftException<
  { _tag: 'NotFound'; scope: undefined },
  { id: number }
>;
type Forbidden = CraftException<
  { _tag: 'Forbidden'; scope: undefined },
  { role: string }
>;

type Dep<Name extends string> = ServiceTrackedDepsRequest<{
  [K in Name]: ServiceDependencies<'function', object>;
}>;
type Raises<E> = CraftGenExceptionMarker<E>;

declare const base: CraftStream<number>;

declare function adding<Name extends string>(
  name: Name,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | Dep<Name>>;

type DepNames<S> =
  S extends CraftStream<any, infer Y>
    ? keyof CompleteServiceDependencyMapFromYielded<Y>
    : never;
type ExceptionsOfStream<S> =
  S extends CraftStream<any, infer Y> ? StreamExceptions<Y> : never;

describe('wave 3: flattening, combination and time carry their types', () => {
  it('switchMap joins the inner stream dependencies and exceptions', () => {
    const inner = {} as CraftStream<string, Dep<'Inner'> | Raises<Forbidden>>;
    const outer = {} as CraftStream<number, Raises<NotFound>>;
    const out = outer.pipe(
      adding('Outer'),
      switchMap((n) => {
        expectTypeOf(n).toEqualTypeOf<number>();
        return inner;
      }),
    );
    expectTypeOf<DepNames<typeof out>>().toEqualTypeOf<'Outer' | 'Inner'>();
    expectTypeOf<ExceptionsOfStream<typeof out>>().toEqualTypeOf<
      NotFound | Forbidden
    >();
  });

  it('concatMap and mergeMap accept their queue options', () => {
    const inner = {} as CraftStream<string>;
    base.pipe(concatMap(() => inner, { buffer: 2, overflow: 'drop-oldest' }));
    base.pipe(mergeMap(() => inner, { concurrency: 3, buffer: 1 }));
    // @ts-expect-error `concurrency` only exists on mergeMap
    base.pipe(concatMap(() => inner, { concurrency: 3 }));
  });

  it('combineLatest keeps tuples and records, and unions every input Y', () => {
    const a = {} as CraftStream<number, Dep<'A'> | Raises<NotFound>>;
    const b = {} as CraftStream<string, Dep<'B'> | Raises<Forbidden>>;
    const tuple = combineLatest([a, b]);
    const named = combineLatest({ a, b });
    expectTypeOf<
      typeof tuple extends CraftStream<infer V, any> ? V : never
    >().toEqualTypeOf<[number, string]>();
    expectTypeOf<
      typeof named extends CraftStream<infer V, any> ? V : never
    >().toEqualTypeOf<{ a: number; b: string }>();
    expectTypeOf<DepNames<typeof tuple>>().toEqualTypeOf<'A' | 'B'>();
    expectTypeOf<ExceptionsOfStream<typeof tuple>>().toEqualTypeOf<
      NotFound | Forbidden
    >();
  });

  it('merge, zip, race and withLatestFrom type their values', () => {
    const a = {} as CraftStream<number>;
    const b = {} as CraftStream<string>;
    expectTypeOf(merge(a, b)).toEqualTypeOf<
      CraftStream<number | string, never>
    >();
    expectTypeOf(zip(a, b)).toEqualTypeOf<
      CraftStream<[number, string], never>
    >();
    expectTypeOf(race(a, b)).toEqualTypeOf<
      CraftStream<number | string, never>
    >();
    expectTypeOf(a.pipe(withLatestFrom(b))).toEqualTypeOf<
      CraftStream<[number, string], never>
    >();
  });

  it('timeout adds its typed exception; the waiting operators add an await', () => {
    const out = base.pipe(timeout(100));
    expectTypeOf<
      ExceptionsOfStream<typeof out>
    >().toEqualTypeOf<StreamTimeoutException>();

    const waits = base.pipe(
      debounce(10),
      delay(10),
      retry(2),
      repeat({ times: 1 }),
    );
    expectTypeOf(waits).toEqualTypeOf<
      CraftStream<number, RuntimeTemporalAwaitRequest>
    >();
  });

  it('timeout can then be caught by tag', () => {
    const out = base.pipe(
      timeout(100),
      catchTag('StreamTimeout', (e) => {
        expectTypeOf(e.payload.ms).toEqualTypeOf<number>();
        return -1;
      }),
    );
    expectTypeOf<ExceptionsOfStream<typeof out>>().toEqualTypeOf<never>();
  });

  it('buffers, pairwise and groupBy reshape the value type', () => {
    expectTypeOf(base.pipe(bufferCount(2))).toEqualTypeOf<
      CraftStream<number[], never>
    >();
    expectTypeOf(base.pipe(pairwise())).toEqualTypeOf<
      CraftStream<[number, number], never>
    >();
    const grouped = base.pipe(groupBy((n) => (n % 2 === 0 ? 'even' : 'odd')));
    expectTypeOf<
      typeof grouped extends CraftStream<infer G, any> ? G : never
    >().toExtend<{ readonly key: 'even' | 'odd' }>();
  });
});
