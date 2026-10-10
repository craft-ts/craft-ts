import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
} from '@craft-ts/core';
import { Duration, Effect, Fiber, Schedule, Stream } from 'effect';
import { craftTemporalClock, craftTemporalClockService } from '../index';

let clock: VirtualCraftTemporalRuntime;
let restoreClock: () => void;

beforeEach(() => {
  clock = new VirtualCraftTemporalRuntime();
  restoreClock = activateCraftTemporalRuntime(clock);
});

afterEach(() => restoreClock());

// Effect resumes a fiber through its own scheduler: give it a few turns.
const turns = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

const withClock = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.provide(craftTemporalClock()));

describe('craftTemporalClock', () => {
  it('Effect.sleep waits on the virtual clock, not on real time', async () => {
    let done = false;
    void Effect.runPromise(
      withClock(
        Effect.sleep('10 seconds').pipe(
          Effect.tap(() => Effect.sync(() => (done = true))),
        ),
      ),
    );

    await turns();
    expect(done).toBe(false);

    await clock.advanceBy(9_999);
    await turns();
    expect(done).toBe(false);

    await clock.advanceBy(1);
    await turns();
    expect(done).toBe(true);
  });

  it('a Schedule and Stream.schedule follow the virtual clock', async () => {
    const seen: number[] = [];
    void Effect.runPromise(
      withClock(
        Stream.make(1, 2, 3).pipe(
          Stream.schedule(Schedule.spaced('1 second')),
          Stream.runForEach((n) => Effect.sync(() => void seen.push(n))),
        ),
      ),
    );

    await turns();
    await clock.advanceBy(1_000);
    await turns();
    const afterOne = [...seen];
    await clock.advanceBy(5_000);
    await turns();

    expect(afterOne.length).toBeLessThan(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('interrupting the fiber cancels the pending task on the runtime', async () => {
    const fiber = Effect.runFork(withClock(Effect.sleep('1 hour')));
    await turns();
    expect(clock.pendingTasks().length).toBeGreaterThan(0);

    await Effect.runPromise(Fiber.interrupt(fiber));
    await turns();

    expect(clock.pendingTasks()).toEqual([]);
  });

  it('reads the civil time of the runtime', () => {
    const service = craftTemporalClockService(clock);

    expect(service.currentTimeMillisUnsafe()).toBe(clock.dateNow());
    expect(service.currentTimeNanosUnsafe()).toBe(
      BigInt(clock.dateNow()) * 1_000_000n,
    );
  });

  it('reads the monotonic time of the runtime', async () => {
    const service = craftTemporalClockService(clock);
    const before = service.monotonicTimeNanosUnsafe();

    await clock.advanceBy(250);

    expect(service.monotonicTimeNanosUnsafe() - before).toBe(250_000_000n);
  });

  it('sleeps on an explicit runtime when given one', async () => {
    const other = new VirtualCraftTemporalRuntime();
    const service = craftTemporalClockService(other);
    let done = false;
    void Effect.runPromise(
      service
        .sleep(Duration.millis(50))
        .pipe(Effect.tap(() => Effect.sync(() => (done = true)))),
    );

    await turns();
    await clock.advanceBy(1_000);
    await turns();
    expect(done).toBe(false);

    await other.advanceBy(50);
    await turns();
    expect(done).toBe(true);
  });
});
