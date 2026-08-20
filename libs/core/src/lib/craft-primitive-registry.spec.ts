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

    const addresses = registry
      .list()
      .filter((entry) => entry.name === 'value')
      .map((entry) => entry.address);

    // Both instances are registered, and neither overwrote the other.
    expect(addresses).toHaveLength(2);
    expect(new Set(addresses).size).toBe(2);
  });
});
