import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mutation } from './mutation';
import { query } from './query';
import { asyncProcess } from './async-process';
import { craftUse } from './craft-use';

/**
 * Regression tests for the method-trigger nonce: every explicit call
 * (`mutate` / `call` / `method`) must re-run the loader, even when the method
 * returns the same value or `undefined`, while preserving idle-until-first-call.
 */

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('method re-trigger (nonce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('mutation: `() => undefined` re-runs the loader on every mutate', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => undefined);
      const { logout } = craftUse(
        mutation('logout', {
          method: () => undefined,
          loader,
        }),
      );

      // idle until the first call: loader must not run on creation
      expect(logout.status()).toBe('idle');
      expect(loader).toHaveBeenCalledTimes(0);

      logout.mutate(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      logout.mutate(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);

      logout.mutate(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(3);
    });
  });

  it('mutation: calling with the same value twice re-runs the loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async ({ params }: { params: string }) => params);
      const { search } = craftUse(
        mutation('search', {
          method: (term: string) => term,
          loader,
        }),
      );

      search.mutate('same');
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      search.mutate('same');
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  it('mutation: loader receives raw params, never the nonce wrapper', async () => {
    await TestBed.runInInjectionContext(async () => {
      const seen: unknown[] = [];
      const { m } = craftUse(
        mutation('m', {
          method: (payload: { id: string }) => payload,
          loader: async ({ params }: { params: { id: string } }) => {
            seen.push(params);
            return params;
          },
        }),
      );

      m.mutate({ id: 'x' });
      await vi.runAllTimersAsync();

      expect(seen).toHaveLength(1);
      // plain object with only the user keys, no sentinel symbol
      expect(seen[0]).toEqual({ id: 'x' });
      expect(Object.getOwnPropertySymbols(seen[0] as object)).toHaveLength(0);
    });
  });

  it('query: `() => undefined` re-runs the loader on every call', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => 'ok');
      const { q } = craftUse(
        query('q', {
          method: () => undefined,
          loader,
        }),
      );

      expect(q.status()).toBe('idle');
      expect(loader).toHaveBeenCalledTimes(0);

      q.call(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      q.call(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  it('asyncProcess: `() => undefined` re-runs the loader on every call', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async () => undefined);
      const { p } = craftUse(
        asyncProcess('p', {
          method: () => undefined,
          loader,
        }),
      );

      expect(p.status()).toBe('idle');
      expect(loader).toHaveBeenCalledTimes(0);

      p.method(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(1);

      p.method(undefined as never);
      await vi.runAllTimersAsync();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });
});
