import { describe, expect, it } from 'vitest';
import { craftUse } from './craft-use';
import { setupCraftServiceTest } from './setup-craft-service-test';
import { AppSnapshotRegistry } from './take-app-snapshot';
import type { DestroyRef } from './host/craft-compat';

describe('AppSnapshotRegistry', () => {
  it('reads registered producers and keeps going when a reader throws', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
    registry.registerSnapshotReader('state', ['component:root'], () => ({
      value: 3,
    }));
    registry.registerSnapshotReader('computed', ['component:root'], () => {
      throw new Error('cannot read');
    });

    expect(registry.snapshot()).toEqual([
      {
        source: 'state',
        from: ['component:root'],
        state: { value: 3 },
      },
      {
        source: 'computed',
        from: ['component:root'],
        state: { error: 'cannot read' },
      },
    ]);
    injector.destroy();
  });

  it('removes a reader when its owner is destroyed', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
    let onDestroy: (() => void) | undefined;
    const destroyRef = {
      onDestroy(callback: () => void) {
        onDestroy = callback;
        return () => undefined;
      },
    } as unknown as DestroyRef;
    registry.registerSnapshotReader('state', [], () => 1, destroyRef);

    expect(registry.snapshot()).toHaveLength(1);
    onDestroy?.();
    expect(registry.snapshot()).toEqual([]);
    injector.destroy();
  });

  it('returns an empty dump when no readers are registered', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));

    expect(registry.snapshot()).toEqual([]);
    expect(registry.activeEffects()).toEqual([]);
    injector.destroy();
  });
});
