import { describe, expect, it, vi } from 'vitest';
import {
  ApplicationInitStatus,
  createEnvironmentInjector,
  DestroyRef,
  EnvironmentInjector,
  inject,
  InjectionToken,
  Injector,
} from './craft-compat';
import { createCraftInjector, type CraftProvider } from './craft-injector';

// Contracts of the provider records and declarations an injector keeps for
// itself: shared declarations never share values, caches or lifetimes.
describe('CraftInjector records', () => {
  it('gives every environment injector its own Injector, EnvironmentInjector, DestroyRef and ApplicationInitStatus', () => {
    const root = createCraftInjector([]);
    const first = createEnvironmentInjector([], root);
    const second = createEnvironmentInjector([], root);

    expect(first.get(Injector)).toBe(first);
    expect(first.get(EnvironmentInjector)).toBe(first);
    expect(second.get(Injector)).toBe(second);
    expect(second.get(EnvironmentInjector)).toBe(second);
    expect(first.get(DestroyRef)).not.toBe(second.get(DestroyRef));
    expect(first.get(ApplicationInitStatus)).not.toBe(
      second.get(ApplicationInitStatus),
    );
    expect(first.get(ApplicationInitStatus)).toBe(
      first.get(ApplicationInitStatus),
    );
    first.destroy();
    expect(second.destroyed).toBe(false);
    expect(second.get(Injector)).toBe(second);
  });

  it('runs a nested environment injector in its own context', () => {
    const root = createCraftInjector([]);
    const parent = createEnvironmentInjector([], root);
    const child = createEnvironmentInjector([], parent);
    expect(child.run(() => inject(Injector))).toBe(child);
    expect(parent.run(() => inject(Injector))).toBe(parent);
  });

  it('keeps value providers live, null and undefined included, per injector', () => {
    const token = new InjectionToken<unknown>('value');
    const provider: { token: object; useValue: unknown } = {
      token,
      useValue: null,
    };
    const first = createCraftInjector([provider]);
    const second = createCraftInjector([provider]);
    expect(first.get(token)).toBeNull();
    expect(first.getOptional(token)).toBeNull();
    provider.useValue = undefined;
    expect(first.get(token)).toBeUndefined();
    expect(first.get(token, 'fallback')).toBeUndefined();
    provider.useValue = 3;
    expect(first.get(token)).toBe(3);
    expect(second.get(token)).toBe(3);
    first.destroy();
    expect(second.get(token)).toBe(3);
  });

  it('composes multi and collection providers in order, mixing values and factories', () => {
    const multi = new InjectionToken<unknown[]>('multi');
    const collection = new InjectionToken<unknown[]>('collection');
    const factory = vi.fn(() => 'built');
    const providers: CraftProvider[] = [
      { token: multi, useValue: 'a', multi: true },
      { token: multi, useFactory: factory, multi: true },
      { token: multi, useValue: undefined, multi: true },
      { token: collection, useValue: ['x', 'y'], collection: true },
      { token: collection, useValue: null, collection: true },
      { token: collection, useFactory: () => ['z'], collection: true },
    ];
    const parent = createCraftInjector([
      { token: multi, useValue: 'parent', multi: true },
    ]);
    const child = parent.createChild(providers);

    expect(child.get(multi)).toEqual(['parent', 'a', 'built', undefined]);
    expect(child.get(multi)).toEqual(['parent', 'a', 'built', undefined]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(child.get(collection)).toEqual(['x', 'y', 'z']);
    expect(parent.get(multi)).toEqual(['parent']);

    const sibling = parent.createChild(providers);
    expect(sibling.get(multi)).toEqual(['parent', 'a', 'built', undefined]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('keeps factory results per injector when the same declarations are reused', () => {
    const token = new InjectionToken<object>('instance');
    const declarations: CraftProvider[] = [
      { token, useFactory: () => ({}) },
    ];
    const first = createCraftInjector(declarations);
    const second = createCraftInjector(declarations);
    expect(first.get(token)).toBe(first.get(token));
    expect(first.get(token)).not.toBe(second.get(token));
  });

  it('builds defaults and children on demand and still cleans them up', () => {
    let built = 0;
    const token = new InjectionToken<object>('default', {
      factory: () => ({ built: ++built }),
    });
    const parent = createCraftInjector([]);
    expect(parent.get(token)).toBe(parent.get(token));
    expect(built).toBe(1);

    const owner = createEnvironmentInjector([], createCraftInjector([]));
    const destroyed: string[] = [];
    const child = createEnvironmentInjector([], owner);
    child.get(DestroyRef).onDestroy(() => destroyed.push('child'));
    const removed = createEnvironmentInjector([], owner);
    removed.get(DestroyRef).onDestroy(() => destroyed.push('removed'));
    removed.destroy();
    owner.get(DestroyRef).onDestroy(() => destroyed.push('owner'));
    owner.destroy();
    owner.destroy();
    expect(destroyed).toEqual(['removed', 'child', 'owner']);
    expect(child.destroyed).toBe(true);

    const leaf = createCraftInjector([]);
    expect(() => leaf.destroy()).not.toThrow();
  });
});
