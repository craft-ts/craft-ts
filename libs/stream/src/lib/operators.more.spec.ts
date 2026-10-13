import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  EmptyStreamError,
  craftException,
  subject,
  type Subject,
} from '@craft-ts/core';
import {
  combineLatestWith,
  concat,
  concatAll,
  concatWith,
  defaultIfEmpty,
  defer,
  distinct,
  empty,
  endWith,
  exhaustAll,
  fail,
  finalize,
  first,
  fromSubscribable,
  ignoreElements,
  last,
  map,
  mergeAll,
  mergeWith,
  never,
  of,
  reduce,
  skipUntil,
  skipWhile,
  switchAll,
  takeLast,
  throwError,
  type CraftStream,
} from '../index';

type Recorded<A> = {
  values: A[];
  exceptions: unknown[];
  errors: unknown[];
  completed: number;
  unsubscribe(): void;
};

function record<A, Y>(stream: CraftStream<A, Y>): Recorded<A> {
  const recorded: Recorded<A> = {
    values: [],
    exceptions: [],
    errors: [],
    completed: 0,
    unsubscribe: () => undefined,
  };
  const subscription = stream.subscribe({
    next: (value) => recorded.values.push(value),
    exception: (exception) => recorded.exceptions.push(exception),
    error: (error) => recorded.errors.push(error),
    complete: () => {
      recorded.completed += 1;
    },
  });
  recorded.unsubscribe = () => subscription.unsubscribe();
  return recorded;
}

function hot<A>() {
  const emitter = subject<A>();
  return {
    emitter,
    stream: fromSubscribable(emitter as Subject<A, never>) as CraftStream<
      A,
      never
    >,
  };
}

describe('creators', () => {
  it('never neither emits nor completes', () => {
    const result = record(never());

    expect(result.values).toEqual([]);
    expect(result.completed).toBe(0);
  });

  it('throwError ends with a defect (a factory runs once per subscription)', () => {
    const failure = new Error('x');
    const factory = vi.fn(() => failure);
    const stream = throwError(factory);
    const a = record(stream);
    const b = record(throwError(failure));
    record(stream);

    expect(a.errors).toEqual([failure]);
    expect(b.errors).toEqual([failure]);
    expect(a.exceptions).toEqual([]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('defer builds a fresh stream per subscriber', () => {
    let runs = 0;
    const stream = defer(() => of(++runs));

    expect(record(stream).values).toEqual([1]);
    expect(record(stream).values).toEqual([2]);
  });

  it('defer accepts a plain Subscribable and rejects anything else', () => {
    const emitter = subject<number>();
    const result = record(defer(() => emitter));
    emitter.next(5);
    const bad = record(defer((() => 42) as never as () => CraftStream<number>));

    expect(result.values).toEqual([5]);
    expect(String(bad.errors[0])).toMatch(/must return a stream/);
  });

  it('concat runs the streams one after the other', () => {
    const a = hot<string>();
    const b = hot<string>();
    const result = record(concat(a.stream, b.stream));
    b.emitter.next('lost');
    a.emitter.next('a1');
    a.emitter.complete();
    b.emitter.next('b1');
    b.emitter.complete();

    expect(result.values).toEqual(['a1', 'b1']);
    expect(result.completed).toBe(1);
    expect(record(concat(of(1, 2), of(3), empty())).values).toEqual([1, 2, 3]);
  });

  it('concat stops at an exception', () => {
    const boom = craftException({ _tag: 'Boom' as const });
    const result = record(concat(of(1), fail(boom), of(2)));

    expect(result.values).toEqual([1]);
    expect(result.exceptions).toHaveLength(1);
  });
});

describe('single values and tails', () => {
  it('first takes the first (matching) value and completes', () => {
    expect(record(of(1, 2, 3).pipe(first())).values).toEqual([1]);
    expect(record(of(1, 2, 3).pipe(first((n) => n > 1))).values).toEqual([2]);
  });

  it('first and last on an empty or unmatched source are an EmptyStreamError defect', () => {
    const none = record(empty().pipe(first()));
    const unmatched = record(of(1).pipe(last((n) => n > 5)));

    expect(none.errors[0]).toBeInstanceOf(EmptyStreamError);
    expect(unmatched.errors[0]).toBeInstanceOf(EmptyStreamError);
  });

  it('last emits the last (matching) value on completion', () => {
    expect(record(of(1, 2, 3).pipe(last())).values).toEqual([3]);
    expect(record(of(1, 2, 3).pipe(last((n) => n < 3))).values).toEqual([2]);
  });

  it('takeLast emits the tail on completion', () => {
    expect(record(of(1, 2, 3, 4).pipe(takeLast(2))).values).toEqual([3, 4]);
    expect(record(of(1, 2).pipe(takeLast(5))).values).toEqual([1, 2]);
    expect(record(of(1, 2).pipe(takeLast(0))).values).toEqual([]);
  });

  it('reduce emits the final accumulator, or the seed when empty', () => {
    expect(
      record(of(1, 2, 3).pipe(reduce((sum, n) => sum + n, 0))).values,
    ).toEqual([6]);
    expect(
      record(empty().pipe(reduce((sum: number) => sum, 7))).values,
    ).toEqual([7]);
  });
});

describe('dropping, emptiness and ends', () => {
  it('skipWhile drops while the predicate holds', () => {
    expect(record(of(1, 2, 3, 1).pipe(skipWhile((n) => n < 3))).values).toEqual(
      [3, 1],
    );
  });

  it('skipUntil drops until the notifier emits', () => {
    const input = hot<number>();
    const open = hot<void>();
    const result = record(input.stream.pipe(skipUntil(open.stream)));
    input.emitter.next(1);
    open.emitter.next();
    input.emitter.next(2);

    expect(result.values).toEqual([2]);
  });

  it('skipUntil takes a plain Subscribable notifier too', () => {
    const input = hot<number>();
    const open = subject<void>();
    const result = record(input.stream.pipe(skipUntil(open)));
    input.emitter.next(1);
    open.next();
    input.emitter.next(2);

    expect(result.values).toEqual([2]);
  });

  it('defaultIfEmpty, ignoreElements, endWith', () => {
    expect(record(empty().pipe(defaultIfEmpty('x'))).values).toEqual(['x']);
    expect(record(of(1).pipe(defaultIfEmpty('x'))).values).toEqual([1]);

    const ignored = record(of(1, 2).pipe(ignoreElements()));
    expect(ignored.values).toEqual([]);
    expect(ignored.completed).toBe(1);

    expect(record(of(1).pipe(endWith(2, 3))).values).toEqual([1, 2, 3]);
  });

  it('distinct drops values already seen, by identity or by key', () => {
    expect(record(of(1, 2, 1, 3, 2).pipe(distinct())).values).toEqual([
      1, 2, 3,
    ]);
    expect(
      record(of({ id: 1 }, { id: 2 }, { id: 1 }).pipe(distinct((v) => v.id)))
        .values,
    ).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('finalize runs after the terminal, and on unsubscribe', () => {
    const events: string[] = [];
    of(1)
      .pipe(finalize(() => events.push('finalized')))
      .subscribe({
        next: () => events.push('next'),
        complete: () => events.push('complete'),
      });
    expect(events).toEqual(['next', 'complete', 'finalized']);

    const input = hot<number>();
    const ended = vi.fn();
    const result = record(input.stream.pipe(finalize(ended)));
    result.unsubscribe();
    expect(ended).toHaveBeenCalledOnce();
  });
});

describe('a stream of streams and the …With forms', () => {
  it('switchAll / concatAll / mergeAll / exhaustAll flatten a stream of streams', () => {
    const inners = [hot<string>(), hot<string>()];
    const outer = hot<CraftStream<string, never>>();
    const switched = record(outer.stream.pipe(switchAll()));
    const merged = record(outer.stream.pipe(mergeAll()));
    const concatenated = record(outer.stream.pipe(concatAll()));
    const exhausted = record(outer.stream.pipe(exhaustAll()));
    outer.emitter.next(inners[0].stream);
    outer.emitter.next(inners[1].stream);
    inners[0].emitter.next('a');
    inners[1].emitter.next('b');

    expect(switched.values).toEqual(['b']);
    expect(merged.values).toEqual(['a', 'b']);
    expect(concatenated.values).toEqual(['a']);
    expect(exhausted.values).toEqual(['a']);
  });

  it('concatWith, mergeWith and combineLatestWith', () => {
    expect(record(of(1).pipe(concatWith(of(2), of(3)))).values).toEqual([
      1, 2, 3,
    ]);

    const a = hot<number>();
    const b = hot<number>();
    const merged = record(a.stream.pipe(mergeWith(b.stream)));
    a.emitter.next(1);
    b.emitter.next(2);
    expect(merged.values).toEqual([1, 2]);

    const left = hot<number>();
    const right = hot<string>();
    const combined = record(left.stream.pipe(combineLatestWith(right.stream)));
    left.emitter.next(1);
    right.emitter.next('x');
    expect(combined.values).toEqual([[1, 'x']]);
  });

  it('types', () => {
    const a = of(1);
    const b = of('s');
    expectTypeOf(a.pipe(first())).toEqualTypeOf<CraftStream<number, never>>();
    expectTypeOf(a.pipe(reduce((s, n) => s + n, 0))).toEqualTypeOf<
      CraftStream<number, never>
    >();
    expectTypeOf(a.pipe(ignoreElements())).toEqualTypeOf<
      CraftStream<never, never>
    >();
    expectTypeOf(a.pipe(defaultIfEmpty('x'))).toEqualTypeOf<
      CraftStream<number | string, never>
    >();
    expectTypeOf(a.pipe(concatWith(b))).toEqualTypeOf<
      CraftStream<number | string, never>
    >();
    expectTypeOf(a.pipe(combineLatestWith(b))).toEqualTypeOf<
      CraftStream<[number, string], never>
    >();
    expectTypeOf(concat(a, b)).toEqualTypeOf<
      CraftStream<number | string, never>
    >();
    expectTypeOf(
      of(a).pipe(
        map((s) => s),
        switchAll(),
      ),
    ).toEqualTypeOf<CraftStream<number, never>>();
  });
});
