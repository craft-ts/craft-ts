import { describe, expect, it } from 'vitest';
import { isSignal, isWritableSignal } from './craft-compat';
import {
  CRAFT_SIGNAL,
  craftBatch,
  craftSignal,
  craftWatch,
  ɵcraftPrivateCell,
  ɵcraftLazyPrivateCell,
} from './craft-signal';
import { RAW_REACTIVE_VALUE } from '../reactive-read';

describe.each([
  { name: 'ɵcraftPrivateCell', create: ɵcraftPrivateCell },
  { name: 'ɵcraftLazyPrivateCell', create: ɵcraftLazyPrivateCell },
])('$name', ({ create }) => {
  it('notifies like a default craftSignal: Object.is, NaN and signed zeros', () => {
    const cell = create<number>(NaN);
    const reference = craftSignal<number>(NaN);
    const seen: number[] = [];
    const expected: number[] = [];
    const watches = [
      craftWatch(() => {
        seen.push(cell());
      }),
      craftWatch(() => {
        expected.push(reference());
      }),
    ];
    for (const next of [NaN, 0, -0, -0, 1]) {
      cell.set(next);
      reference.set(next);
    }
    expect(seen).toEqual(expected);
    expect(seen).toHaveLength(4);
    expect(Object.is(seen[2], -0)).toBe(true);
    watches.forEach((watch) => watch.destroy());
  });

  it('publishes a new object written in place only when its identity changes', () => {
    const value = { count: 0 };
    const cell = create(value);
    let runs = 0;
    const watch = craftWatch(() => {
      cell();
      runs++;
    });
    value.count = 1;
    cell.set(value);
    expect(runs).toBe(1);
    cell.set({ count: 1 });
    expect(runs).toBe(2);
    watch.destroy();
  });

  it('joins the ambient batch and stops notifying a destroyed watch', () => {
    const cell = create(0);
    const seen: number[] = [];
    const watch = craftWatch(() => {
      seen.push(cell());
    });
    craftBatch(() => {
      cell.set(1);
      cell.update((value) => value + 1);
    });
    expect(seen).toEqual([0, 2]);
    watch.destroy();
    cell.set(3);
    expect(seen).toEqual([0, 2]);
    expect(cell()).toBe(3);
  });

  it('does not subscribe the writing effect to the equality read inside set/update', () => {
    const written = create(0);
    const trigger = create(0);
    let runs = 0;
    const watch = craftWatch(() => {
      runs++;
      written.set(trigger());
      written.update((value) => value);
    });
    written.set(42);
    expect(runs).toBe(1);
    trigger.set(1);
    expect(runs).toBe(2);
    expect(written()).toBe(1);
    watch.destroy();
  });

  it('is not a public signal: no brand, no raw marker, no asReadonly', () => {
    const cell = create(0);
    expect(isSignal(cell)).toBe(false);
    expect(isWritableSignal(cell)).toBe(false);
    expect((cell as unknown as Record<symbol, unknown>)[CRAFT_SIGNAL]).toBe(
      undefined,
    );
    expect(
      (cell as unknown as Record<symbol, unknown>)[RAW_REACTIVE_VALUE],
    ).toBe(undefined);
    expect('asReadonly' in cell).toBe(false);
  });

  it('observes the latest unread writes and then tracks subsequent batches', () => {
    const cell = create(0);
    cell.set(2);
    cell.update((value) => value + 3);
    const seen: number[] = [];
    const watch = craftWatch(() => {
      seen.push(cell());
    });
    expect(seen).toEqual([5]);
    craftBatch(() => {
      cell.set(7);
      cell.update((value) => value + 1);
    });
    expect(seen).toEqual([5, 8]);
    watch.destroy();
  });
});
