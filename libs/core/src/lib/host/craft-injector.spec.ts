import { inject, InjectionToken, Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import {
  craftToken,
  createCraftInjector,
  getCurrentCraftInjector,
} from './craft-injector';
import { ɵcraftInjectorFromHost } from './angular-craft-injector-host';

describe('CraftInjector', () => {
  it('resolves a factory provider from the same injector', () => {
    const Name = craftToken<string>('Name');
    const Greeting = craftToken<string>('Greeting');
    const injector = createCraftInjector([
      { token: Name, useValue: 'Craft' },
      {
        token: Greeting,
        useFactory: (current) => `Hello ${current.get(Name)}`,
      },
    ]);

    expect(injector.get(Greeting)).toBe('Hello Craft');
  });

  it('returns null for an optional token that is not provided', () => {
    const Missing = craftToken<string>('Missing');
    const injector = createCraftInjector([]);

    expect(injector.getOptional(Missing)).toBeNull();
  });

  it('requires tokens to be explicitly provided', () => {
    const Missing = craftToken<string>('Missing');
    const injector = createCraftInjector([]);

    expect(() => injector.get(Missing)).toThrowError(
      'No provider for Craft token "Missing".',
    );
  });

  it('lets a child override a parent token without changing the parent', () => {
    const Name = craftToken<string>('Name');
    const root = createCraftInjector([{ token: Name, useValue: 'root' }]);
    const child = root.createChild([{ token: Name, useValue: 'child' }]);

    expect(child.get(Name)).toBe('child');
    expect(root.get(Name)).toBe('root');
  });

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

  it('restores the parent injector after a nested run()', () => {
    const root = createCraftInjector([]);
    const child = root.createChild([]);

    root.run(() => {
      expect(getCurrentCraftInjector()).toBe(root);
      child.run(() => {
        expect(getCurrentCraftInjector()).toBe(child);
      });
      expect(getCurrentCraftInjector()).toBe(root);
    });
  });

  it('restores the parent injector when a nested run() throws', () => {
    const root = createCraftInjector([]);
    const child = root.createChild([]);

    root.run(() => {
      expect(() =>
        child.run(() => {
          throw new Error('boom');
        }),
      ).toThrowError('boom');
      expect(getCurrentCraftInjector()).toBe(root);
    });
  });

  it('keeps the current injector across asynchronous Node work', async () => {
    const root = createCraftInjector([]);

    await root.run(async () => {
      expect(getCurrentCraftInjector()).toBe(root);
      await Promise.resolve();
      expect(getCurrentCraftInjector()).toBe(root);
    });
  });

  it('restores Angular injection context for a host injector run()', () => {
    const Value = new InjectionToken<string>('Value');
    const angularInjector = Injector.create({
      providers: [{ provide: Value, useValue: 'angular' }],
    });

    const value = ɵcraftInjectorFromHost(angularInjector).run(() =>
      inject(Value),
    );

    expect(value).toBe('angular');
  });
});
