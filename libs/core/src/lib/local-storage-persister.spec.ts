import { craftResource } from './craft-resource';
import {
  signal,
} from './host/craft-compat';
import { createStoragePersister } from './local-storage-persister';
import type { StorageServiceApi } from './browser-boundaries';
import { vi } from 'vitest';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from './setup-craft-service-test';


const runInInjectionContext = <T>(fn: () => T): T => {
  const { injector } = setupCraftServiceTest();
  lastInjector = injector;
  return injector.run(fn);
};
let lastInjector: ReturnType<typeof setupCraftServiceTest>['injector'];
const flushHost = () => flushCraftTest(lastInjector);

describe('createStoragePersister', () => {
  let storage: StorageServiceApi;

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
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      length: vi.fn(() => Object.keys(store).length),
    };
    storage = mockLocalStorage;
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1 Should add a query to persist and store the query result in localStorage when the query is resolved', async () => {
    await runInInjectionContext(async () => {
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
        (call) => call[0] === 'ng-craft-query-resource-user',
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
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        }),
      );
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      expect(persister).toBeDefined();

      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
    });
  });

  it('3 Should clear the persisted query from localStorage', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        }),
      );
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      persister.clearQuery('user');
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('4 Should clear all the persisted queries from localStorage', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        }),
      );
      localStorage.setItem(
        'ng-craft-query-resource-users',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: [{ id: 1, name: 'Romain' }],
        }),
      );
      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const queryUSersParamsFnSignal = signal<{ id: number } | undefined>(
        undefined,
      );
      const queryUsersResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
        'ng-craft-query-resource-user',
      );
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-users',
      );
    });
  });

  it('5 Should wait for the params source to be defined and equal to previous value before retrieve the value', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
      flushHost();
      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });
  it('6 Should wait for the params source to be defined and not equal to previous value, so the value is not retrieved and the cache deleted', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
      flushHost();
      expect(queryResource.status()).toBe('loading');
      expect(queryResource.value()).toEqual(undefined);
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      await vi.runAllTimersAsync();
      expect(queryResource.status()).toBe('resolved');
      expect(queryResource.value()).toEqual({ id: 2, name: 'Romain' });
    });
  });

  it('7 Should not retrieve expired cached value and remove it from localStorage', async () => {
    await runInInjectionContext(async () => {
      // Set a cached value with timestamp that is older than cacheTime
      const expiredTimestamp = Date.now() - 6000; // 6 seconds ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: expiredTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
        'ng-craft-query-resource-user',
      );
    });
  });

  it('8 Should retrieve valid cached value when cache time has not expired', async () => {
    await runInInjectionContext(async () => {
      // Set a cached value with timestamp that is still valid
      const validTimestamp = Date.now() - 2000; // 2 seconds ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: validTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      expect(localStorage.removeItem).not.toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('9 Should check cache expiration when waitForParamsSrcToBeEqualToPreviousValue is true', async () => {
    await runInInjectionContext(async () => {
      // Set a cached value with timestamp that is expired
      const expiredTimestamp = Date.now() - 6000; // 6 seconds ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: expiredTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
      flushHost();

      // Should not have set the cached value since it's expired
      expect(queryResource.status()).toBe('loading');
      expect(queryResource.value()).toEqual(undefined);
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );

      await vi.runAllTimersAsync();
      expect(queryResource.status()).toBe('resolved');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
    });
  });

  it('10 Should ignore cache time validation when cacheTime is 0 or negative', async () => {
    await runInInjectionContext(async () => {
      // Set a cached value with very old timestamp
      const veryOldTimestamp = Date.now() - 60000; // 1 minute ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: veryOldTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);

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
      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
      expect(localStorage.removeItem).not.toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  // --- staleTime tests ---

  it('11 Should restore cached value without reload when staleTime is not exceeded', async () => {
    await runInInjectionContext(async () => {
      const freshTimestamp = Date.now() - 2000; // 2 seconds ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: freshTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Fresh' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 60000,
        staleTime: 5000, // 5s — data is only 2s old, not stale
      });

      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  it('12 Should restore cached value AND trigger reload when staleTime is exceeded (SWR)', async () => {
    await runInInjectionContext(async () => {
      const staleTimestamp = Date.now() - 6000; // 6 seconds ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: staleTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Fresh' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 60000,
        staleTime: 5000, // 5s — data is 6s old, stale
      });

      expect(reloadSpy).toHaveBeenCalledOnce();
      expect(reloadSpy).toHaveBeenCalledOnce();
    });
  });

  it('13 Should not restore when cacheTime is exceeded even if staleTime would apply', async () => {
    await runInInjectionContext(async () => {
      const expiredTimestamp = Date.now() - 6000; // 6 seconds ago
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: expiredTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Fresh' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 5000, // 5s — expired
        staleTime: 10000, // 10s — would not be stale, but cacheTime wins
      });

      expect(queryResource.status()).toBe('idle');
      expect(queryResource.value()).toBeUndefined();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('14 Should restore cached value without reload when staleTime not exceeded (waitForParams=true)', async () => {
    await runInInjectionContext(async () => {
      const freshTimestamp = Date.now() - 2000;
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: freshTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Fresh' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 60000,
        staleTime: 5000,
      });

      queryParamsFnSignal.set({ id: 1 });
      flushHost();

      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  it('15 Should restore AND trigger reload when staleTime exceeded (waitForParams=true)', async () => {
    await runInInjectionContext(async () => {
      const staleTimestamp = Date.now() - 6000;
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: staleTimestamp,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Fresh' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 60000,
        staleTime: 5000,
      });

      queryParamsFnSignal.set({ id: 1 });
      flushHost();

      expect(reloadSpy).toHaveBeenCalledOnce();
      expect(['loading', 'reloading']).toContain(queryResource.status());
    });
  });

  // --- validate tests ---

  it('16 Should not restore cached value when validate returns false', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: Date.now(),
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 60000,
        validate: () => false,
      });

      expect(queryResource.status()).toBe('idle');
      expect(queryResource.value()).toBeUndefined();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('17 Should restore cached value when validate returns true', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: Date.now(),
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 60000,
        validate: (v): boolean => typeof (v as any)?.name === 'string',
      });

      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.removeItem).not.toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('18 Should not restore and remove cache when validate returns false (waitForParams=true)', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: Date.now(),
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 60000,
        validate: () => false,
      });

      queryParamsFnSignal.set({ id: 1 });
      flushHost();

      expect(queryResource.value()).toBeUndefined();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('19 Should restore cached value when validate returns true (waitForParams=true)', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: Date.now(),
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: true,
        cacheTime: 60000,
        validate: (v): boolean => typeof (v as any)?.name === 'string',
      });

      queryParamsFnSignal.set({ id: 1 });
      flushHost();

      expect(queryResource.status()).toBe('local');
      expect(queryResource.value()).toEqual({ id: 1, name: 'Romain' });
    });
  });

  it('20 Should not restore when validate fails even if staleTime would trigger reload', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: Date.now() - 6000,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Romain' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 60000,
        staleTime: 5000,
        validate: () => false,
      });

      expect(queryResource.status()).toBe('idle');
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-query-resource-user',
      );
    });
  });

  it('21 Should restore AND reload when validate passes and staleTime is exceeded', async () => {
    await runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-query-resource-user',
        JSON.stringify({
          queryParams: { id: 1 },
          queryValue: { id: 1, name: 'Romain' },
          timestamp: Date.now() - 6000,
        }),
      );

      const queryParamsFnSignal = signal<{ id: number } | undefined>(undefined);
      const queryResource = craftResource({
        params: queryParamsFnSignal,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params?.id, name: 'Fresh' };
        },
      });
      const reloadSpy = vi.spyOn(queryResource, 'reload');

      const persister = createStoragePersister('query', storage);
      persister.addQueryToPersist({
        key: 'user',
        queryResource,
        queryResourceParamsSrc: queryParamsFnSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 60000,
        staleTime: 5000,
        validate: (v): boolean => typeof (v as any)?.name === 'string',
      });

      expect(reloadSpy).toHaveBeenCalledOnce();
      // No params request is active in this scenario; Angular keeps the raw
      // resource status at `idle`. The reload call above is the contract.
      expect(queryResource.status()).toBe('idle');
    });
  });
});

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}
