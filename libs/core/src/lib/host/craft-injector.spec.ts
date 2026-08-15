import { describe, expect, it } from 'vitest';
import {
  craftToken,
  createCraftInjector,
  getCurrentCraftInjector,
} from './craft-injector';

describe('CraftInjector', () => {
  it('resolves a value in a child without leaking to the parent', () => {
    const Name = craftToken<string>('Name');
    const root = createCraftInjector([]);
    const child = root.createChild([{ token: Name, useValue: 'craft' }]);
    expect(child.get(Name)).toBe('craft');
    expect(child.getOptional(Name)).toBe('craft');
    expect(root.getOptional(Name)).toBeNull();
  });

  it('run() makes getCurrentCraftInjector available', () => {
    const root = createCraftInjector([]);
    const seen = root.run(() => getCurrentCraftInjector());
    expect(seen).toBe(root);
  });
});
