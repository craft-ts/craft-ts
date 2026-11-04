import { describe, expect, it, vi } from 'vitest';
import { createCraftStream, Teardown } from './craft-stream';
import { combineLatest } from './operators/combine';

describe('Teardown failure isolation', () => {
  it('surfaces synchronous completion cleanup failures after releasing everything', () => {
    const failure = new Error('terminal cleanup');
    const released = vi.fn();
    const source = createCraftStream((_context, sink, teardown) => {
      teardown.add(released);
      teardown.add(() => {
        throw failure;
      });
      sink.complete();
    });
    expect(() => source.subscribe({})).toThrow(failure);
    expect(released).toHaveBeenCalledOnce();
  });

  it('preserves both a terminal observer failure and a cleanup failure', () => {
    const observerFailure = new Error('observer');
    const cleanupFailure = new Error('cleanup');
    const source = createCraftStream((_context, sink, teardown) => {
      teardown.add(() => {
        throw cleanupFailure;
      });
      sink.complete();
    });
    let thrown: unknown;
    try {
      source.subscribe({
        complete: () => {
          throw observerFailure;
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([
      observerFailure,
      cleanupFailure,
    ]);
  });

  it('runs all callbacks in reverse registration order and stays closed after failure', () => {
    const teardown = new Teardown();
    const failure = new Error('cleanup');
    const calls: number[] = [];
    teardown.add(() => {
      calls.push(1);
    });
    teardown.add(() => {
      calls.push(2);
      throw failure;
    });
    teardown.add(() => {
      calls.push(3);
      teardown.unsubscribe();
    });
    expect(() => teardown.unsubscribe()).toThrow(failure);
    expect(calls).toEqual([3, 2, 1]);
    expect(teardown.closed).toBe(true);
    expect(() => teardown.unsubscribe()).not.toThrow();
    const late = vi.fn();
    teardown.add(late);
    expect(late).toHaveBeenCalledOnce();
  });

  it('reports all failures, including non-Error values', () => {
    const teardown = new Teardown();
    const first = new Error('first');
    teardown.add(() => {
      throw first;
    });
    teardown.add(() => {
      throw undefined;
    });
    let thrown: unknown;
    try {
      teardown.unsubscribe();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([undefined, first]);
  });

  it('unsubscribes all combined inputs even if one input fails to release', () => {
    const failure = new Error('input cleanup');
    const released = vi.fn();
    const failing = createCraftStream<number>((_context, sink, teardown) => {
      sink.next(1);
      teardown.add(() => {
        throw failure;
      });
    });
    const other = createCraftStream<number>((_context, sink, teardown) => {
      sink.next(2);
      teardown.add(released);
    });
    const subscription = combineLatest([failing, other]).subscribe({});
    expect(() => subscription.unsubscribe()).toThrow(failure);
    expect(released).toHaveBeenCalledOnce();
    expect(() => subscription.unsubscribe()).not.toThrow();
  });
});
