import { Injector } from './host/craft-compat';
import { describe, expect, it } from 'vitest';
import {
  activateCraftRandomRuntime,
  CRAFT_RANDOM_RUNTIME,
  RealCraftRandomRuntime,
  SeededCraftRandomRuntime,
} from './craft-random-runtime';

describe('Craft random runtime', () => {
  it('provides a cached real runtime by default', () => {
    const injector = Injector.create({ providers: [] });
    const runtime = injector.get(CRAFT_RANDOM_RUNTIME);

    expect(runtime).toBeInstanceOf(RealCraftRandomRuntime);
    expect(injector.get(CRAFT_RANDOM_RUNTIME)).toBe(runtime);
  });

  it('repeats the same sequence from the same seed', () => {
    const first = new SeededCraftRandomRuntime(1234);
    const second = new SeededCraftRandomRuntime(1234);

    expect([first.next(), first.next(), first.uuid()]).toEqual([
      second.next(),
      second.next(),
      second.uuid(),
    ]);
  });

  it('produces version 4 UUIDs and validates seeds', () => {
    const uuid = new SeededCraftRandomRuntime(1).uuid();

    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(() => new SeededCraftRandomRuntime(-1)).toThrow(RangeError);
    expect(() => new SeededCraftRandomRuntime(1.5)).toThrow(RangeError);
  });

  it('routes existing real runtime references through an active seeded source', () => {
    const real = new RealCraftRandomRuntime();
    const expected = new SeededCraftRandomRuntime(99);
    const actual = new SeededCraftRandomRuntime(99);
    const restore = activateCraftRandomRuntime(actual);

    try {
      expect([real.next(), real.uuid()]).toEqual([
        expected.next(),
        expected.uuid(),
      ]);
    } finally {
      restore();
    }
  });
});
