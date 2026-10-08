import { TestBed } from './host/craft-test-bed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mutation } from './mutation';
import { query } from './query';
import { craftUse } from './craft-use';

/**
 * `reload` is a private write of the insertion context, next to `set` /
 * `update` / `patch`. A primitive does not expose it publicly: only an
 * insertion that publishes it does.
 */
describe('insertion reload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('query: is not part of the public type unless an insertion publishes it', () => {
    TestBed.runInInjectionContext(() => {
      const users = craftUse(
        query('users', {
          params: () => 'x',
          loader: async () => ({ id: 'x' }),
        }),
      );

      // @ts-expect-error `reload` is private to insertions
      void users.reload;
      // @ts-expect-error nor is it reachable through `resource`
      void users.resource.reload;
    });
  });

  it('query: an insertion can publish reload, which re-runs the loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => ({ id: 'x' }));
      const users = craftUse(
        query(
          'users',
          { params: () => 'x', loader },
          ({ reload }) => ({ reload: () => reload() }),
        ),
      );

      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      expect(craftUse(users.reload())).toBe(true);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  it('query: reload keeps the value while it reloads', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query(
          'users',
          {
            params: () => 'x',
            loader: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              return { id: 'x' };
            },
          },
          ({ reload }) => ({ reload: () => reload() }),
        ),
      );

      await vi.runAllTimersAsync();
      craftUse(users.reload());

      expect(craftUse(users.status())).toBe('reloading');
      expect(craftUse(users.value())).toEqual({ id: 'x' });
    });
  });

  it('query: reload resolves to false when no request has been made yet', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => ({ id: 'x' }));
      const users = craftUse(
        query(
          'users',
          { method: (_: undefined) => undefined, loader },
          ({ reload }) => ({ reload: () => reload() }),
        ),
      );

      expect(craftUse(users.reload())).toBe(false);
      await vi.runAllTimersAsync();
      expect(loader).not.toHaveBeenCalled();
    });
  });

  it('query: reload re-runs a method-based query after its first call', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => ({ id: 'x' }));
      const users = craftUse(
        query(
          'users',
          { method: (_: undefined) => undefined, loader },
          ({ reload }) => ({ reload: () => reload() }),
        ),
      );

      users.call(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      expect(craftUse(users.reload())).toBe(true);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  it('mutation: an insertion can publish reload', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => undefined);
      const save = craftUse(
        mutation(
          'save',
          { method: (_: undefined) => undefined, loader },
          ({ reload }) => ({ reload: () => reload() }),
        ),
      );

      save.mutate(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      expect(craftUse(save.reload())).toBe(true);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  it('mutation: is not part of the public type unless an insertion publishes it', () => {
    TestBed.runInInjectionContext(() => {
      const save = craftUse(
        mutation('save', {
          method: (_: undefined) => undefined,
          loader: async () => undefined,
        }),
      );

      // @ts-expect-error `reload` is private to insertions
      void save.reload;
      // @ts-expect-error nor is it reachable through `resource`
      void save.resource.reload;
    });
  });
});
