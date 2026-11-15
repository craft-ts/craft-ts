import { describe, expect, it, vi } from 'vitest';
import { CraftTestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { isGenerator, isGeneratorFunction } from './craft-generator-runtime';
import { craftSignal, craftWatch } from './host/craft-signal';
import {
  executeYieldable,
  ɵsettledReader,
  ɵsettledValueReader,
} from './yieldable';
import { inject, Injector } from './host/craft-compat';

// A settled reader stands where `function* () { return value; }` stood: every
// host has to take it for a generator function and get the value out of it.
describe('settled readers', () => {
  it('is taken for a generator function by every check of one', () => {
    const reader = ɵsettledValueReader(1);
    expect(isGeneratorFunction(reader)).toBe(true);
    // The check `state` and `i18n` keep for themselves.
    expect(Object.prototype.toString.call(reader)).toBe(
      '[object GeneratorFunction]',
    );
    expect(isGeneratorFunction(() => 1)).toBe(false);
    expect(
      isGeneratorFunction(function* () {
        return 1;
      }),
    ).toBe(true);
    const other = () => 1;
    (other as unknown as Record<symbol, unknown>)[Symbol.toStringTag] = 'Other';
    expect(isGeneratorFunction(other)).toBe(false);
  });

  it('hands its value to yield*, craftUse and a generator host', () => {
    const item = { id: 1 };
    const reader = ɵsettledValueReader(item);
    const delegated = (function* () {
      return yield* reader();
    })();
    expect(delegated.next()).toEqual({ done: true, value: item });
    expect(craftUse(reader())).toBe(item);
    CraftTestBed.runInInjectionContext(() => {
      expect(executeYieldable(reader, [], inject(Injector))).toBe(item);
    });
  });

  it('is done at its first next(), without yielding anything', () => {
    const invocation = ɵsettledValueReader('a')();
    expect(isGenerator(invocation)).toBe(true);
    expect([...invocation]).toEqual([]);
    expect(invocation.next()).toEqual({ done: true, value: 'a' });
    expect(invocation.next()).toEqual({ done: true, value: 'a' });
  });

  it('reads at each call, inside the effect that calls it', () => {
    const position = craftSignal(0);
    const read = vi.fn(() => position());
    const reader = ɵsettledReader(read);
    const seen: number[] = [];
    const watch = craftWatch(() => {
      seen.push(craftUse(reader()));
    });
    position.set(3);
    expect(seen).toEqual([0, 3]);
    expect(read).toHaveBeenCalledTimes(2);
    watch.destroy();
  });

  it('keeps null, undefined and falsy values as they are', () => {
    for (const value of [null, undefined, 0, '', false]) {
      expect(craftUse(ɵsettledValueReader(value)())).toBe(value);
    }
  });
});
