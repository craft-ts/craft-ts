import { describe, expect, it } from 'vitest';
import { VirtualCraftTemporalRuntime } from '@craft-ts/core';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
} from './host-runtime';
import {
  createForScheduler,
  provideForScheduler,
  SyncForScheduler,
  ɵinjectForSchedulerIn,
} from './for-scheduling';

describe('scheduleFor virtual clock integration', () => {
  it('holds queued frames until the Craft clock advances', async () => {
    const clock = new VirtualCraftTemporalRuntime(100);
    const scheduler = createForScheduler(
      { enabled: true, strategy: 'frame', frameBudgetMs: 4 },
      clock,
    );
    let ran = 0;
    scheduler.schedule(() => ran++);
    await clock.advanceBy(15);
    expect(ran).toBe(0);
    await clock.advanceBy(1);
    expect(ran).toBe(1);
    scheduler.destroy?.();
  });
});

/** Counts every `Error` built while `run` executes, whoever catches it. */
function countErrorsBuilt(run: () => void): number {
  const original = globalThis.Error;
  let built = 0;
  globalThis.Error = new Proxy(original, {
    construct(target, args, newTarget) {
      built += 1;
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) {
      built += 1;
      return Reflect.apply(target, thisArg, args);
    },
  });
  try {
    run();
  } finally {
    globalThis.Error = original;
  }
  return built;
}

describe('the scheduler a list asks its injector for', () => {
  it('is absent without an error being built for the miss', () => {
    const injector = createEnvironmentInjector(
      [],
      Injector.create({ providers: [] }) as EnvironmentInjector,
    );
    let scheduler: unknown = 'not asked';

    const built = countErrorsBuilt(() => {
      scheduler = ɵinjectForSchedulerIn(injector);
    });

    expect(scheduler).toBeNull();
    expect(built).toBe(0);
  });

  it('is the one an ancestor injector provides', () => {
    const provided = new SyncForScheduler();
    const injector = createEnvironmentInjector(
      [],
      Injector.create({
        providers: [provideForScheduler(provided)],
      }) as EnvironmentInjector,
    );

    expect(ɵinjectForSchedulerIn(injector)).toBe(provided);
  });
});
