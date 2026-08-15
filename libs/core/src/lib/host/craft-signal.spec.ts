import { describe, expect, it, vi } from 'vitest';
import {
  craftComputed,
  craftLinkedSignal,
  craftSignal,
  craftWatch,
  isCraftSignal,
  untracked,
} from './craft-signal';
import { RAW_REACTIVE_VALUE } from '../reactive-read';

describe('craftSignal', () => {
  it('notifies a computed when the source updates', () => {
    const count = craftSignal(0);
    const doubled = craftComputed(() => count() * 2);
    expect(doubled()).toBe(0);
    count.set(2);
    expect(doubled()).toBe(4);
    expect(isCraftSignal(doubled)).toBe(true);
  });

  it('untracked does not subscribe', () => {
    const count = craftSignal(0);
    const seen = craftComputed(() => untracked(() => count()));
    expect(seen()).toBe(0);
    count.set(1);
    expect(seen()).toBe(0);
  });

  it('retains the raw reactive value for Craft internals', () => {
    const count = craftSignal(0);

    expect(
      Object.getOwnPropertyDescriptor(count, RAW_REACTIVE_VALUE)?.value,
    ).toBe(count);
  });

  it('links a writable signal to its source', () => {
    const count = craftSignal(1);
    const doubled = craftLinkedSignal({
      source: count,
      computation: () => count() * 2,
    });

    expect(doubled()).toBe(2);
    doubled.set(9);
    expect(doubled()).toBe(9);
    count.set(3);
    expect(doubled()).toBe(6);
  });

  it('does not keep recomputing an unread linked signal', () => {
    const count = craftSignal(1);
    const computation = vi.fn(() => count() * 2);
    const doubled = craftLinkedSignal({
      source: count,
      computation,
    });

    expect(doubled()).toBe(2);
    computation.mockClear();

    count.set(2);
    expect(computation).not.toHaveBeenCalled();
    expect(doubled()).toBe(4);
  });

  it('keeps a local write made before the first linked read', () => {
    const count = craftSignal(1);
    const doubled = craftLinkedSignal({
      source: count,
      computation: () => count() * 2,
    });

    doubled.set(9);

    expect(doubled()).toBe(9);
  });

  it('watches dependencies until destroyed', () => {
    const count = craftSignal(0);
    const seen: number[] = [];
    const cleaned: number[] = [];
    const watch = craftWatch(() => {
      const value = count();
      seen.push(value);
      return () => cleaned.push(value);
    });

    count.set(1);
    expect(seen).toEqual([0, 1]);
    expect(cleaned).toEqual([0]);

    watch.destroy();
    count.set(2);
    expect(seen).toEqual([0, 1]);
    expect(cleaned).toEqual([0, 1]);
  });

  it('accepts the Task 2 effect option shape', () => {
    const watch = craftWatch(
      () => {
        /* noop */
      },
      {
        injector: {} as never,
        manualCleanup: true,
        debugName: 'compatible-watch',
      },
    );

    watch.destroy();
  });
});
