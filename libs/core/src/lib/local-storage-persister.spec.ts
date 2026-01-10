import { resource, signal } from '@angular/core';
import { localStoragePersister } from './local-storage-persister';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

describe('localStoragePersister', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
      }),
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1 Should add a query to persist and store the query result in localStorage when the query is resolved', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      expect(persister).toBeDefined();
      expect(localStorage.setItem).not.toHaveBeenCalled();

      queryParamsFnSignal.set({ id: 1 });
      expect(queryResource.status()).toBe('loading');
      await vi.runAllTimersAsync();

      expect(queryResource.status()).toBe('resolved');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });

      // Check that setItem was called
      expect(localStorage.setItem).toHaveBeenCalled();

      // Verify the stored value structure by checking the mock calls
      const setItemCalls = vi.mocked(localStorage.setItem).mock.calls;
      const userCall = setItemCalls.find(
        (call) => call[0] === 'ng-craft-query-resource-user'
      );
      expect(userCall).toBeDefined();

      const storedData = JSON.parse(userCall![1]);
      expect(storedData.queryParams).toEqual({ id: 1 });
      expect(storedData.queryValue).toEqual({ id: 1, name: 'Romain' });
      expect(typeof storedData.timestamp).toBe('number');
      expect(storedData.timestamp).toBeGreaterThan(0);
    });
  });

  it('2 Should set the query resource value of a persisted value with the same query key', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        })
      );
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      expect(persister).toBeDefined();

      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');
    });
  });

  it('3 Should clear the persisted query from localStorage', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        })
      );
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      expect(persister).toBeDefined();

      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');
      persister.clearQuery('user');
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
    });
  });

  it('4 Should clear all the persisted queries from localStorage', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        })
      );
      localStorage.setItem(
        'ng-craft-query-users',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: [{ id: 1, name: 'Romain' }],
        })
      );
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const queryUSersParamsFnSignal = signal<{ id: number } | undefined>(
        undefined
      );
      const queryUsersResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      persister.addQueryToPersist({
        key: 'users',
        queryResource: queryUsersResource,
        queryResourceParamsSrc: queryUSersParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      expect(persister).toBeDefined();
      persister.clearAllQueries();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-users'
      );
    });
  });

  it('5 Should wait for the params source to be defined and equal to previous value before retrieve the value', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        })
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 50000,
      });

      expect(queryResource.value()).toEqual(undefined);
      queryParamsFnSignal.set({ id: 1 });
      expect(queryResource.status()).toBe('loading');
      TestBed.tick();
      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');
    });
  });
  it('6 Should wait for the params source to be defined and not equal to previous value, so the value is not retrieved and the cache deleted', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        })
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 0,
      });

      expect(queryResource.value()).toEqual(undefined);
      queryParamsFnSignal.set({ id: 2 });
      expect(queryResource.status()).toBe('loading');
      TestBed.tick();
      expect(queryResource.status()).toBe('loading');
      expect(queryResource.value()).toEqual(undefined);
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');
      await vi.runAllTimersAsync();
      expect(queryResource.status()).toBe('resolved');
      expect(queryResource.value()).toEqual({ id: 2, name: 'Romain' });
    });
  });

  it('7 Should not retrieve expired cached value and remove it from localStorage', async () => {
    await TestBed.runInInjectionContext(async () => {
      // Set a cached value with timestamp that is older than cacheTime
      const expiredTimestamp = Date.now() - 6000; // 6 seconds ago
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: expiredTimestamp,
        })
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 5000, // 5 seconds cache time
      });

      // Should not have set the cached value since it's expired
      expect(queryResource.status()).toBe('idle');
      expect(queryResource.value()).toEqual(undefined);
      // Should have removed the expired value
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
    });
  });

  it('8 Should retrieve valid cached value when cache time has not expired', async () => {
    await TestBed.runInInjectionContext(async () => {
      // Set a cached value with timestamp that is still valid
      const validTimestamp = Date.now() - 2000; // 2 seconds ago
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: validTimestamp,
        })
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 5000, // 5 seconds cache time
      });

      // Should have set the cached value since it's still valid
      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');
      expect(localStorage.removeItem).not.toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
    });
  });

  it('9 Should check cache expiration when waitForParamsSrcToBeEqualToPreviousValue is true', async () => {
    await TestBed.runInInjectionContext(async () => {
      // Set a cached value with timestamp that is expired
      const expiredTimestamp = Date.now() - 6000; // 6 seconds ago
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: expiredTimestamp,
        })
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 5000, // 5 seconds cache time
      });

      expect(queryResource.value()).toEqual(undefined);
      queryParamsFnSignal.set({ id: 1 });
      expect(queryResource.status()).toBe('loading');
      TestBed.tick();

      // Should not have set the cached value since it's expired
      expect(queryResource.status()).toBe('loading');
      expect(queryResource.value()).toEqual(undefined);
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');

      await vi.runAllTimersAsync();
      expect(queryResource.status()).toBe('resolved');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
    });
  });

  it('10 Should ignore cache time validation when cacheTime is 0 or negative', async () => {
    await TestBed.runInInjectionContext(async () => {
      // Set a cached value with very old timestamp
      const veryOldTimestamp = Date.now() - 60000; // 1 minute ago
      localStorage.setItem(
        'ng-craft-query-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: veryOldTimestamp,
        })
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = resource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = localStoragePersister('query');

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 0, // No cache time validation
      });

      // Should still retrieve the cached value even though timestamp is old
      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.getItem).toHaveBeenCalledWith('ng-craft-query-user');
      expect(localStorage.removeItem).not.toHaveBeenCalledWith(
        'ng-craft-query-user'
      );
    });
  });
});

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}
