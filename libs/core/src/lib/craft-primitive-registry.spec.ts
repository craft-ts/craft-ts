import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { craftService } from './craft-service';
import { state } from './state';
import {
  CRAFT_PRIMITIVE_REGISTRY,
  type CraftPrimitiveRegistry,
} from './craft-primitive-registry';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'function' },
  function* () {
    const count = yield* state('count', 0, ({ set }) => ({
      to: (value: number) => set(value),
    }));
    return { count };
  },
);

describe('craft primitive registry', () => {
  let registry: CraftPrimitiveRegistry;

  beforeEach(() => {
    TestBed.resetTestingModule();
    registry = TestBed.inject(CRAFT_PRIMITIVE_REGISTRY);
  });

  it('addresses a primitive by its host chain and name', () => {
    TestBed.runInInjectionContext(() => craftUse(Counter()));

    const entry = registry
      .list()
      .find((candidate) => candidate.name === 'count');

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('state');
    expect(entry?.address).toContain('state:count');
    // Every address carries its occurrence, like a component host tag does.
    expect(entry?.address).toMatch(/#\d+$/);
    expect(entry?.read()).toBe(0);
  });

  it('writes a value back through the address', () => {
    TestBed.runInInjectionContext(() => craftUse(Counter()));

    const entry = registry.list().find((c) => c.name === 'count');
    entry?.write(7);

    expect(entry?.read()).toBe(7);
  });

  it('captures and restores a snapshot', () => {
    const store = TestBed.runInInjectionContext(() => craftUse(Counter()));

    const snapshot = registry.capture();
    craftUse(store.count.to(42));
    expect(craftUse(store.count())).toBe(42);

    registry.restore(snapshot);

    expect(craftUse(store.count())).toBe(0);
  });

  it('keeps two instances of the same host apart', () => {
    const { Row } = craftService(
      { name: 'Row', providedIn: 'function' },
      function* () {
        const value = yield* state('value', 'a');
        return { value };
      },
    );

    TestBed.runInInjectionContext(() => {
      craftUse(Row());
      craftUse(Row());
    });

    const entries = registry.list().filter((entry) => entry.name === 'value');

    // Both instances are registered, and neither overwrote the other.
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.address)).size).toBe(2);

    // A service that can exist several times at once says WHICH one it is, so
    // the two are told apart by their host chain rather than only by the
    // registry's own tiebreaker — which is what snapshots and logs read.
    const hostChains = entries.map((entry) => entry.hostTags.join(' / '));
    expect(new Set(hostChains).size).toBe(2);
    for (const chain of hostChains) {
      expect(chain).toMatch(/service:Row#\d+/);
    }
  });

  it('leaves a singleton host unnumbered', () => {
    const { Settings } = craftService(
      { name: 'Settings', providedIn: 'global' },
      function* () {
        const theme = yield* state('theme', 'light');
        return { theme };
      },
    );

    TestBed.runInInjectionContext(() => craftUse(Settings()));

    const entry = registry.list().find((candidate) => candidate.name === 'theme');

    // There is exactly one of it, so a number would be noise in every log line.
    expect(entry?.hostTags).toContain('service:Settings');
  });
});
