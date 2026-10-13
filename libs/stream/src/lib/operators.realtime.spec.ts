import { describe, expect, it } from 'vitest';
import {
  craftException,
  subject,
  ɵinjectCraftTemporalRuntime as temporalRuntime,
  type Subject,
} from '@craft-ts/core';
import {
  bufferTime,
  debounce,
  defer,
  delay,
  fail,
  fromSubscribable,
  interval,
  of,
  retry,
  take,
  timeout,
  timer,
  type AnyCraftStream,
  type CraftStream,
} from '../index';

// ---------------------------------------------------------------------------
// The temporal operators on the REAL runtime. Everywhere else they run on a
// virtual clock, which proves the logic and says nothing about the wiring to
// native timers. These specs use short real delays and assert ordering and
// lower bounds — never an upper bound, which would only measure the machine.
// ---------------------------------------------------------------------------

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, limitMs = 2000) {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > limitMs) {
      throw new Error('Timed out waiting for the condition.');
    }
    await wait(5);
  }
}

function observe(stream: AnyCraftStream) {
  const seen = {
    values: [] as unknown[],
    stamps: [] as number[],
    exceptions: [] as unknown[],
    errors: [] as unknown[],
    completed: false,
    startedAt: performance.now(),
  };
  const subscription = stream.subscribe({
    next: (value: unknown) => {
      seen.values.push(value);
      seen.stamps.push(performance.now() - seen.startedAt);
    },
    exception: (e: unknown) => seen.exceptions.push(e),
    error: (e: unknown) => seen.errors.push(e),
    complete: () => {
      seen.completed = true;
    },
  });
  return { seen, subscription };
}

const live = () => {
  const source = subject<number, never>();
  return {
    source,
    stream: fromSubscribable(source) as CraftStream<number, never>,
  };
};

describe('temporal operators on the real runtime', () => {
  it('interval emits in order, spaced by its period, and take ends it', async () => {
    const { seen } = observe(interval(30).pipe(take(3)) as AnyCraftStream);

    await until(() => seen.completed);

    expect(seen.values).toEqual([0, 1, 2]);
    expect(seen.stamps[0]).toBeGreaterThanOrEqual(25);
    expect(seen.stamps[2]).toBeGreaterThanOrEqual(85);
  });

  it('timer waits, and unsubscribing first cancels it for good', async () => {
    const waited = observe(timer(30) as AnyCraftStream);
    const cancelled = observe(timer(30) as AnyCraftStream);
    cancelled.subscription.unsubscribe();

    await until(() => waited.seen.completed);
    await wait(60);

    expect(waited.seen.values).toEqual([0]);
    expect(waited.seen.stamps[0]).toBeGreaterThanOrEqual(25);
    expect(cancelled.seen.values).toEqual([]);
  });

  it('debounce emits only the last of a burst, after the quiet period', async () => {
    const { source, stream } = live();
    const { seen } = observe(stream.pipe(debounce(50)) as AnyCraftStream);

    source.next(1);
    await wait(15);
    source.next(2);
    await wait(15);
    source.next(3);
    const lastAt = performance.now() - seen.startedAt;
    await until(() => seen.values.length > 0);

    expect(seen.values).toEqual([3]);
    expect(seen.stamps[0] - lastAt).toBeGreaterThanOrEqual(40);
  });

  it('delay holds each value back', async () => {
    const { seen } = observe(of(1, 2).pipe(delay(40)) as AnyCraftStream);

    await until(() => seen.completed);

    expect(seen.values).toEqual([1, 2]);
    expect(seen.stamps[0]).toBeGreaterThanOrEqual(35);
  });

  it('timeout turns silence into a typed exception, and a value in time into none', async () => {
    const silent = observe(live().stream.pipe(timeout(40)) as AnyCraftStream);
    const quick = observe(of(1).pipe(timeout(200)) as AnyCraftStream);

    await until(() => silent.seen.exceptions.length > 0);

    expect((silent.seen.exceptions[0] as { _tag: string })._tag).toBe(
      'StreamTimeout',
    );
    expect(quick.seen.exceptions).toEqual([]);
    expect(quick.seen.values).toEqual([1]);
  });

  it('retry re-subscribes after its delay until the source succeeds', async () => {
    let attempts = 0;
    const flaky = defer(() => {
      attempts += 1;
      return attempts < 3
        ? fail(
            craftException({ _tag: 'Flaky' as const }, { attempt: attempts }),
          )
        : of('ok');
    });
    const { seen } = observe(
      flaky.pipe(retry({ times: 3, delayMs: 20 })) as AnyCraftStream,
    );

    await until(() => seen.completed);

    expect(seen.values).toEqual(['ok']);
    expect(attempts).toBe(3);
    expect(seen.stamps[0]).toBeGreaterThanOrEqual(35);
  });

  it('bufferTime groups what arrived in each period', async () => {
    const { source, stream } = live();
    const { seen } = observe(stream.pipe(bufferTime(60)) as AnyCraftStream);

    source.next(1);
    source.next(2);
    await until(() => seen.values.length >= 1);
    source.next(3);
    (source as Subject<number, never>).complete();
    await until(() => seen.completed);

    expect(seen.values[0]).toEqual([1, 2]);
    expect(seen.values.flat()).toEqual([1, 2, 3]);
  });

  it('leaves no task on the runtime once everything has ended or been cancelled', async () => {
    const running = observe(interval(20) as AnyCraftStream);
    const debounced = observe(
      live().stream.pipe(debounce(500)) as AnyCraftStream,
    );
    await wait(50);

    running.subscription.unsubscribe();
    debounced.subscription.unsubscribe();
    await wait(30);

    expect(temporalRuntime().pendingTasks()).toEqual([]);
  });
});
