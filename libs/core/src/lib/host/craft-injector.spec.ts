import { InjectionToken, Injector } from './craft-compat';
import { describe, expect, it } from 'vitest';
import {
  createCraftInjector,
  getCurrentCraftInjector,
} from './craft-injector';
import { ɵcraftInjectorFromHost } from './craft-injector-host';

describe('CraftInjector', () => {
  it('resolves a factory provider from the same injector', () => {
    const Name = { debugName: 'Name' };
    const Greeting = { debugName: 'Greeting' };
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
    const Missing = { debugName: 'Missing' };
    const injector = createCraftInjector([]);

    expect(injector.getOptional(Missing)).toBeNull();
  });

  it('requires tokens to be explicitly provided', () => {
    const Missing = { debugName: 'Missing' };
    const injector = createCraftInjector([]);

    expect(() => injector.get(Missing)).toThrowError(
      'No provider for Craft token "Missing".',
    );
  });

  it('names the missing token the same through a chain of parents, raising one Error for the miss', () => {
    const Missing = { debugName: 'Missing' };
    const root = createCraftInjector([]);
    const leaf = root.createChild([]).createChild([]).createChild([]);

    const raised: Error[] = [];
    const Native = globalThis.Error;
    // Counts the Errors built while the lookup runs: each is a stack trace.
    globalThis.Error = class extends Native {
      constructor(message?: string) {
        super(message);
        raised.push(this);
      }
    } as ErrorConstructor;
    try {
      expect(() => leaf.get(Missing)).toThrowError('No provider for Craft token "Missing".');
    } finally {
      globalThis.Error = Native;
    }
    expect(raised).toHaveLength(1);
  });

  it('still falls back to a default found above when a child does not provide the token', () => {
    const Name = { debugName: 'Name' };
    const root = createCraftInjector([{ token: Name, useValue: 'root' }]);
    const leaf = root.createChild([]).createChild([]);

    expect(leaf.get(Name)).toBe('root');
    expect(leaf.getOptional(Name)).toBe('root');
  });

  it('lets a child override a parent token without changing the parent', () => {
    const Name = { debugName: 'Name' };
    const root = createCraftInjector([{ token: Name, useValue: 'root' }]);
    const child = root.createChild([{ token: Name, useValue: 'child' }]);

    expect(child.get(Name)).toBe('child');
    expect(root.get(Name)).toBe('root');
  });

  it('resolves a value in a child without leaking to the parent', () => {
    const Name = { debugName: 'Name' };
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

  it('resolves host injector tokens through Craft get()', () => {
    const Value = new InjectionToken<string>('Value');
    const angularInjector = Injector.create({
      providers: [{ provide: Value, useValue: 'angular' }],
    });

    const value = ɵcraftInjectorFromHost(angularInjector).run(() =>
      ɵcraftInjectorFromHost(angularInjector).get(Value),
    );

    expect(value).toBe('angular');
  });

  it('scopes default token factories to one root injector', () => {
    const Value = new InjectionToken<object>('PerRootValue', {
      providedIn: 'root',
      factory: () => ({}),
    });
    const first = createCraftInjector([]);
    const second = createCraftInjector([]);

    expect(first.get(Value)).toBe(first.get(Value));
    expect(second.get(Value)).toBe(second.get(Value));
    expect(first.get(Value)).not.toBe(second.get(Value));
  });
});
