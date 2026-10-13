import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { subject } from '@craft-ts/core';
import { Observable } from 'rxjs';
import {
  bindCallback,
  bindNodeCallback,
  from,
  fromFetch,
  fromIterable,
  fromPromise,
  generate,
  of,
  take,
  type CraftStream,
} from '../index';

type Recorded<A> = {
  values: A[];
  errors: unknown[];
  completed: number;
  unsubscribe(): void;
};

function record<A, Y>(stream: CraftStream<A, Y>): Recorded<A> {
  const recorded: Recorded<A> = {
    values: [],
    errors: [],
    completed: 0,
    unsubscribe: () => undefined,
  };
  const subscription = stream.subscribe({
    next: (value) => recorded.values.push(value),
    error: (error) => recorded.errors.push(error),
    complete: () => {
      recorded.completed += 1;
    },
  });
  recorded.unsubscribe = () => subscription.unsubscribe();
  return recorded;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('fromPromise and fromIterable', () => {
  it('fromPromise emits the resolved value then completes', async () => {
    const result = record(fromPromise(Promise.resolve(7)));
    await settle();

    expect(result.values).toEqual([7]);
    expect(result.completed).toBe(1);
  });

  it('fromPromise turns a rejection into a defect and honours unsubscribe', async () => {
    const failure = new Error('no');
    const rejected = record(fromPromise(Promise.reject(failure)));
    const cancelled = record(fromPromise(Promise.resolve(1)));
    cancelled.unsubscribe();
    await settle();

    expect(rejected.errors).toEqual([failure]);
    expect(cancelled.values).toEqual([]);
  });

  it('fromIterable emits in order and stops when its consumer does', () => {
    expect(record(fromIterable(new Set([1, 2, 3]))).values).toEqual([1, 2, 3]);
    expect(record(fromIterable([1, 2, 3, 4]).pipe(take(2))).values).toEqual([
      1, 2,
    ]);
  });
});

describe('from', () => {
  it('lifts arrays, sets, promises, subscribables and craft streams', async () => {
    expect(record(from([1, 2])).values).toEqual([1, 2]);
    expect(record(from(new Set(['a']))).values).toEqual(['a']);
    expect(record(from(of(5))).values).toEqual([5]);

    const emitter = subject<number>();
    const viaSubject = record(from(emitter));
    emitter.next(9);
    expect(viaSubject.values).toEqual([9]);

    const viaRx = record(
      from(
        new Observable<number>((subscriber) => {
          subscriber.next(3);
          subscriber.complete();
        }),
      ),
    );
    expect(viaRx.values).toEqual([3]);

    const viaPromise = record(from(Promise.resolve('p')));
    await settle();
    expect(viaPromise.values).toEqual(['p']);
  });

  it('rejects anything else as a defect', () => {
    const result = record(from(42 as never));

    expect(String(result.errors[0])).toMatch(/expected a stream/);
  });

  it('types the value of what it lifts', () => {
    expectTypeOf(from([1, 2])).toEqualTypeOf<CraftStream<number, never>>();
    expectTypeOf(from(Promise.resolve('x'))).toEqualTypeOf<
      CraftStream<string, never>
    >();
    expectTypeOf(from(of(1))).toEqualTypeOf<CraftStream<number, never>>();
  });
});

describe('generate', () => {
  it('iterates a state while the condition holds', () => {
    const result = record(
      generate({
        initialState: 1,
        condition: (n) => n <= 20,
        iterate: (n) => n * 2,
      }),
    );

    expect(result.values).toEqual([1, 2, 4, 8, 16]);
    expect(result.completed).toBe(1);
  });

  it('maps states through resultSelector and is bounded by its consumer', () => {
    const result = record(
      generate({
        initialState: 0,
        iterate: (n) => n + 1,
        resultSelector: (n) => `#${n}`,
      }).pipe(take(3)),
    );

    expect(result.values).toEqual(['#0', '#1', '#2']);
    expect(result.completed).toBe(1);
  });
});

describe('fromFetch', () => {
  it('emits the Response then completes, passing the request through', async () => {
    const response = new Response('ok', { status: 404 });
    const fetchSpy = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const result = record(fromFetch('/api', { method: 'POST' }));
      await settle();

      // An HTTP error status is a value, not a failure.
      expect(result.values).toEqual([response]);
      expect(result.completed).toBe(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('aborts the request on unsubscribe, without reporting an error', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    try {
      const result = record(fromFetch('/slow'));
      result.unsubscribe();
      await settle();

      expect(signal?.aborted).toBe(true);
      expect(result.errors).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('turns a network failure into a defect', async () => {
    const failure = new TypeError('network');
    vi.stubGlobal('fetch', () => Promise.reject(failure));
    try {
      const result = record(fromFetch('/down'));
      await settle();

      expect(result.errors).toEqual([failure]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('bindCallback and bindNodeCallback', () => {
  it('bindCallback emits the callback arguments once, a single one as is', () => {
    const single = bindCallback((x: number, done: (r: number) => void) =>
      done(x * 2),
    );
    const several = bindCallback(
      (a: string, done: (x: string, y: number) => void) => done(a, 1),
    );

    expect(record(single(4)).values).toEqual([8]);
    expect(record(several('z')).values).toEqual([['z', 1]]);
    expectTypeOf(single(1)).toEqualTypeOf<CraftStream<number, never>>();
    expectTypeOf(several('a')).toEqualTypeOf<
      CraftStream<[string, number], never>
    >();
  });

  it('bindCallback runs the function once per subscription', () => {
    let calls = 0;
    const bound = bindCallback((done: (r: number) => void) => {
      calls += 1;
      done(calls);
    });
    const stream = bound();

    expect(record(stream).values).toEqual([1]);
    expect(record(stream).values).toEqual([2]);
  });

  it('bindNodeCallback emits the result, or fails with a defect on a non-null error', () => {
    const read = bindNodeCallback(
      (path: string, done: (error: unknown, text: string) => void) =>
        path === 'bad'
          ? done(new Error('ENOENT'), '')
          : done(null, `ok:${path}`),
    );

    expect(record(read('a')).values).toEqual(['ok:a']);
    const failed = record(read('bad'));
    expect(failed.values).toEqual([]);
    expect(String(failed.errors[0])).toMatch(/ENOENT/);
  });
});
