import { describe, expect, it } from 'vitest';
import { craftUse } from './craft-use';
import { CraftPrimitiveRegistry } from './craft-primitive-registry';
import { setupCraftServiceTest } from './setup-craft-service-test';
import {
  captureCraftTransferSnapshot,
  primeCraftTransferSnapshot,
  serializeCraftTransferSnapshot,
} from './craft-transfer-snapshot';

describe('Craft transfer snapshots', () => {
  it('captures state and query metadata and serializes script text safely', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(CraftPrimitiveRegistry()));
    registry.register('component:App / state:message', {
      kind: 'state',
      name: 'message',
      hostTags: ['component:App'],
      read: () => '</script><script>alert("x")</script>\u2028',
      write: () => undefined,
    });
    registry.register('component:App / query:users', {
      kind: 'query',
      name: 'users',
      hostTags: ['component:App'],
      read: () => [{ id: 42 }],
      write: () => undefined,
      status: () => 'error',
      error: () => new TypeError('network failed'),
    });

    const snapshot = captureCraftTransferSnapshot(registry);
    expect(Object.values(snapshot.values)).toEqual([
      '</script><script>alert("x")</script>\u2028',
    ]);
    expect(Object.values(snapshot.queries)).toEqual([
      {
        status: 'error',
        value: [{ id: 42 }],
        error: { name: 'TypeError', message: 'network failed' },
      },
    ]);

    const serialized = serializeCraftTransferSnapshot(snapshot);
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).not.toContain('\u2028');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(serialized)).toEqual(snapshot);
  });

  it('primes primitives that register after the browser reads the snapshot', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(CraftPrimitiveRegistry()));
    let restored: unknown;
    primeCraftTransferSnapshot(registry, {
      version: 1,
      values: { 'component:App / state:count#1': 42 },
      queries: {},
    });

    registry.register('component:App / state:count', {
      kind: 'state',
      name: 'count',
      hostTags: ['component:App'],
      read: () => restored,
      write: (value) => {
        restored = value;
      },
    });

    expect(restored).toBe(42);
  });

  it('rejects cycles and non-plain transferable values', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const { injector } = setupCraftServiceTest();
    const cyclicRegistry = injector.run(() =>
      craftUse(CraftPrimitiveRegistry()),
    );
    cyclicRegistry.register('state:cycle', {
      kind: 'state',
      name: 'cycle',
      hostTags: [],
      read: () => cycle,
      write: () => undefined,
    });

    expect(() => captureCraftTransferSnapshot(cyclicRegistry)).toThrow(
      'contains a cycle',
    );

    const { injector: classRegistryInjector } = setupCraftServiceTest();
    const classRegistry = classRegistryInjector.run(() =>
      craftUse(CraftPrimitiveRegistry()),
    );
    classRegistry.register('state:date', {
      kind: 'state',
      name: 'date',
      hostTags: [],
      read: () => new Date(),
      write: () => undefined,
    });
    expect(() => captureCraftTransferSnapshot(classRegistry)).toThrow(
      'plain objects and arrays',
    );
  });
});
