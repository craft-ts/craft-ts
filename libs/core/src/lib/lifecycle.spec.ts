import { describe, expect, it, vi } from 'vitest';
import {
  DestroyRef,
  effect,
  signal,
  ɵdestroyCraftDestroyRef,
} from './host/craft-compat';
import { craftEffect } from './craft-effect';
import { craftUse } from './craft-use';
import { setupCraftServiceTest } from './setup-craft-service-test';
import {
  RealCraftTemporalRuntime,
  SuspendableCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type TemporalTaskHandle,
} from './temporal-runtime';

describe('cleanup failures', () => {
  it.each([
    RealCraftTemporalRuntime,
    SuspendableCraftTemporalRuntime,
    VirtualCraftTemporalRuntime,
  ])(
    'cancels all tasks and notifies all cancellation listeners: %s',
    (Runtime) => {
      const clock = new Runtime();
      const failure = new Error('cancellation listener');
      const released = vi.fn();
      // Exercise the internal listener used by sleep cancellation without
      // widening the public task-handle API.
      type WithListener = TemporalTaskHandle & {
        onCancelled(callback: () => void): void;
      };
      const first = clock.schedule(() => undefined, 60_000) as WithListener;
      const second = clock.schedule(() => undefined, 60_000) as WithListener;
      first.onCancelled(() => {
        throw failure;
      });
      first.onCancelled(released);
      second.onCancelled(released);
      expect(() => clock.cancelAll()).toThrow(failure);
      expect(released).toHaveBeenCalledTimes(2);
      expect(clock.pendingTasks()).toEqual([]);
      expect(() => clock.cancelAll()).not.toThrow();
    },
  );

  it('runs every cleanup of an effect invalidated by a signal write', () => {
    const { injector } = setupCraftServiceTest();
    const input = signal(0);
    const failure = new Error('previous run');
    const released = vi.fn();
    injector.run(() =>
      effect((onCleanup) => {
        input();
        onCleanup(() => {
          throw failure;
        });
        onCleanup(released);
      }),
    );
    expect(() => input.set(1)).toThrow(failure);
    expect(released).toHaveBeenCalledOnce();
    expect(() => injector.destroy()).not.toThrow();
  });

  it('runs all DestroyRef callbacks once and preserves a single thrown value', () => {
    const ref = new DestroyRef();
    const failure = { reason: 'cleanup failed' };
    const calls: number[] = [];
    ref.onDestroy(() => {
      calls.push(1);
      throw failure;
    });
    ref.onDestroy(() => {
      calls.push(2);
    });
    let thrown: unknown;
    try {
      ɵdestroyCraftDestroyRef(ref);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    expect(calls).toEqual([1, 2]);
    expect(() => ɵdestroyCraftDestroyRef(ref)).not.toThrow();
    const late = vi.fn();
    ref.onDestroy(late);
    expect(late).toHaveBeenCalledOnce();
  });

  it('aggregates every failure after running the remaining scope callbacks', () => {
    const { injector } = setupCraftServiceTest();
    const first = new Error('first');
    const second = new Error('second');
    const last = vi.fn();
    const ref = injector.get(DestroyRef);
    ref.onDestroy(() => {
      throw first;
    });
    ref.onDestroy(() => {
      throw second;
    });
    ref.onDestroy(last);
    let thrown: unknown;
    try {
      injector.destroy();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([first, second]);
    expect(last).toHaveBeenCalledOnce();
    expect(() => injector.destroy()).not.toThrow();
  });

  it.each(['effect', 'craftEffect'])(
    'runs every %s cleanup during scope destruction',
    (kind) => {
      const { injector } = setupCraftServiceTest();
      const failure = new Error('effect cleanup');
      const released = vi.fn();
      injector.run(() => {
        const body = (onCleanup: (callback: () => void) => void) => {
          onCleanup(() => {
            throw failure;
          });
          onCleanup(released);
        };
        if (kind === 'effect') effect(body);
        else craftUse(craftEffect('cleanup', body));
      });
      expect(() => injector.destroy()).toThrow(failure);
      expect(released).toHaveBeenCalledOnce();
      expect(() => injector.destroy()).not.toThrow();
    },
  );
});
