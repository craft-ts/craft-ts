import { describe, expect, it } from 'vitest';
import {
  craftBatch,
  craftComputed,
  craftSignal,
  craftWatch,
} from './craft-signal';

// What craftBatch guarantees, and what it does not. These are the facts a caller has
// to rely on when deciding to group writes (see docs/engine/batched-writes.md).
describe('craftBatch', () => {
  it('lets the code inside read what it has just written, signals and computeds alike', () => {
    const count = craftSignal(1);
    const double = craftComputed(() => count() * 2);
    let readInside: [number, number] | undefined;

    craftBatch(() => {
      count.set(5);
      readInside = [count(), double()];
    });

    expect(readInside).toEqual([5, 10]);
  });

  it('wakes the effects once, after the last write, never between two of them', () => {
    const first = craftSignal(0);
    const second = craftSignal(0);
    const seen: string[] = [];
    const watch = craftWatch(() => {
      seen.push(`${first()}/${second()}`);
    });
    seen.length = 0;

    craftBatch(() => {
      first.set(1);
      expect(seen).toEqual([]);
      second.set(1);
      expect(seen).toEqual([]);
    });

    expect(seen).toEqual(['1/1']);
    watch.destroy();
  });

  it('only the outermost batch publishes: nested ones join it', () => {
    const value = craftSignal(0);
    const seen: number[] = [];
    const watch = craftWatch(() => {
      seen.push(value());
    });
    seen.length = 0;

    craftBatch(() => {
      craftBatch(() => value.set(1));
      expect(seen).toEqual([]);
      value.set(2);
    });

    expect(seen).toEqual([2]);
    watch.destroy();
  });

  it('keeps the writes already made when the callback throws, publishes them once, and rethrows', () => {
    const first = craftSignal(0);
    const second = craftSignal(0);
    const seen: string[] = [];
    const watch = craftWatch(() => {
      seen.push(`${first()}/${second()}`);
    });
    seen.length = 0;

    expect(() =>
      craftBatch(() => {
        first.set(1);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // No rollback: the first write stands, and the effect saw the half-written state
    // once, at the end. The caller must not leave a batch in the middle of a pair.
    expect(first()).toBe(1);
    expect(second()).toBe(0);
    expect(seen).toEqual(['1/0']);

    // The batch was closed: the next write publishes at once again.
    second.set(1);
    expect(seen).toEqual(['1/0', '1/1']);
    watch.destroy();
  });

  it('returns what the callback returns', () => {
    expect(craftBatch(() => 42)).toBe(42);
  });

  it('closes the batch when an effect throws as it publishes, and the effects queued behind it wait for the next write', () => {
    const value = craftSignal(0);
    const behind: number[] = [];
    const boom = craftWatch(() => {
      if (value() === 1) throw new Error('effect failed');
    });
    const queuedBehind = craftWatch(() => {
      behind.push(value());
    });
    behind.length = 0;

    expect(() => craftBatch(() => value.set(1))).toThrow('effect failed');

    // The effect that throws stops the publication: the one queued after it did not
    // see 1 (this is the same without a batch, one write at a time).
    expect(behind).toEqual([]);

    // The batch depth was restored: the next write publishes straight away, and wakes
    // the effect that was left behind.
    value.set(2);
    expect(behind).toEqual([2]);
    boom.destroy();
    queuedBehind.destroy();
  });
});
