import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import { FN_WRAP_OBSERVER, FN_WRAPPER } from './fn-wrapper';
import {
  craftSleep,
  exponentialTemporalSchedule,
  fixedTemporalSchedule,
  provideCraftTemporalRuntime,
  sequenceTemporalSchedule,
  withCraftTimeout,
  VirtualCraftTemporalRuntime,
} from './temporal-runtime';

describe('VirtualCraftTemporalRuntime', () => {
  it('executes tasks by deadline and creation order', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const events: string[] = [];

    clock.schedule(() => events.push('second'), 20, { kind: 'test' });
    clock.schedule(() => events.push('first'), 10, { kind: 'test' });
    clock.schedule(() => events.push('same-deadline'), 10, { kind: 'test' });

    expect(clock.pendingTasks()).toMatchObject([
      { dueAt: 10, id: 2 },
      { dueAt: 10, id: 3 },
      { dueAt: 20, id: 1 },
    ]);

    await clock.advanceBy(10);
    expect(events).toEqual(['first', 'same-deadline']);
    expect(clock.now()).toBe(10);

    await clock.advanceToNextTask();
    expect(events).toEqual(['first', 'same-deadline', 'second']);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('cancels a task idempotently and filters by owner', () => {
    const clock = new VirtualCraftTemporalRuntime();
    const callback = () => undefined;
    const owned = clock.schedule(callback, 10, { owner: 'component' });
    clock.schedule(callback, 10, { owner: 'service' });

    expect(clock.pendingTasks('component')).toHaveLength(1);
    expect(owned.cancel()).toBe(true);
    expect(owned.cancel()).toBe(false);
    expect(clock.pendingTasks('component')).toEqual([]);
    expect(clock.pendingTasks()).toHaveLength(1);
  });

  it('runs newly scheduled tasks at the same virtual time', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const events: string[] = [];

    clock.schedule(() => {
      events.push('parent');
      clock.schedule(() => events.push('child'), 0);
    }, 5);

    await clock.advanceBy(5);
    expect(events).toEqual(['parent', 'child']);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('runs a sleep request through the async Craft driver', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const injector = Injector.create({
      providers: [
        provideCraftTemporalRuntime(clock),
        { provide: FN_WRAPPER, useValue: [] },
        { provide: FN_WRAP_OBSERVER, useValue: [] },
      ],
    });
    const events: string[] = [];

    const result = executeGeneratorCompatibleFactoryAsync({
      factory: function* () {
        events.push('started');
        yield* craftSleep(100, { owner: 'test-program' });
        events.push('resumed');
        return 42;
      },
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid',
    });

    await Promise.resolve();
    expect(events).toEqual(['started']);
    expect(clock.pendingTasks('test-program')).toMatchObject([
      { dueAt: 100, kind: 'sleep', owner: 'test-program' },
    ]);

    await clock.advanceBy(99);
    expect(events).toEqual(['started']);

    await clock.advanceBy(1);
    await expect(result).resolves.toMatchObject({ kind: 'done', value: 42 });
    expect(events).toEqual(['started', 'resumed']);
  });

  it('aborts a pending craftSleep when the program signal is aborted', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const abortController = new AbortController();
    const injector = Injector.create({
      providers: [
        provideCraftTemporalRuntime(clock),
        { provide: FN_WRAPPER, useValue: [] },
        { provide: FN_WRAP_OBSERVER, useValue: [] },
      ],
    });
    const events: string[] = [];

    const result = executeGeneratorCompatibleFactoryAsync({
      factory: function* () {
        events.push('started');
        yield* craftSleep(100, { owner: 'query' });
        events.push('resumed');
        return 42;
      },
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid',
      abortSignal: abortController.signal,
    });

    await Promise.resolve();
    expect(clock.pendingTasks('query')).toHaveLength(1);

    abortController.abort();

    await expect(result).rejects.toMatchObject({
      name: 'TemporalCancelledError',
    });
    expect(events).toEqual(['started']);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('rejects a pending sleep when the runtime is reset', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const pending = clock.sleep(100);

    clock.reset();

    await expect(pending).rejects.toMatchObject({
      name: 'TemporalCancelledError',
    });
  });
});

describe('Craft temporal schedules', () => {
  it('computes fixed and exponential retry delays', () => {
    const fixed = fixedTemporalSchedule(25, { maxAttempts: 2 });
    expect(fixed.next({ attempt: 1, elapsedMs: 0 })).toEqual({
      done: false,
      delayMs: 25,
    });
    expect(fixed.next({ attempt: 3, elapsedMs: 50 })).toEqual({ done: true });

    expect(
      fixedTemporalSchedule(5).next({ attempt: 100, elapsedMs: 0 }),
    ).toEqual({
      done: false,
      delayMs: 5,
    });

    const exponential = exponentialTemporalSchedule(10, { maxAttempts: 3 });
    expect(
      [1, 2, 3].map((attempt) => exponential.next({ attempt, elapsedMs: 0 })),
    ).toEqual([
      { done: false, delayMs: 10 },
      { done: false, delayMs: 20 },
      { done: false, delayMs: 40 },
    ]);
  });

  it('stops a sequence schedule after its declared delays', () => {
    const schedule = sequenceTemporalSchedule([0, 50]);
    expect(schedule.next({ attempt: 1, elapsedMs: 0 })).toEqual({
      done: false,
      delayMs: 0,
    });
    expect(schedule.next({ attempt: 2, elapsedMs: 0 })).toEqual({
      done: false,
      delayMs: 50,
    });
    expect(schedule.next({ attempt: 3, elapsedMs: 50 })).toEqual({
      done: true,
    });
  });
});

describe('withCraftTimeout', () => {
  it('cancels the timeout when the operation resolves first', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const result = withCraftTimeout(Promise.resolve('ok'), 100, {
      runtime: clock,
      owner: 'operation',
    });

    await expect(result).resolves.toBe('ok');
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('rejects when the virtual deadline is reached', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const result = withCraftTimeout(new Promise(() => undefined), 50, {
      runtime: clock,
      owner: 'operation',
    });

    await clock.advanceBy(50);
    await expect(result).rejects.toMatchObject({
      name: 'CraftTimeoutError',
      timeoutMs: 50,
    });
    expect(clock.pendingTasks()).toEqual([]);
  });
});
