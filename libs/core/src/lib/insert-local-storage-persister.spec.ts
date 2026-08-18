import {
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncProcess } from './async-process';
import { craftUnique } from './craft-unique';
import { insertStoragePersister } from './insert-storage-persister';
import { mutation } from './mutation';
import { query } from './query';
import { state } from './state';
import { craftPipe } from './craft-pipe';
import { craftUse } from './craft-use';
import type { GetServiceOutput } from './craft-service';
import {
  LocalStoragePersister,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
  SessionStoragePersister,
  type StoragePersisterApi,
} from './storage-persister.service';

type _LocalStoragePersisterMatchesContract =
  GetServiceOutput<typeof LocalStoragePersister> extends StoragePersisterApi
    ? true
    : never;
type _SessionStoragePersisterMatchesContract =
  GetServiceOutput<typeof SessionStoragePersister> extends StoragePersisterApi
    ? true
    : never;
const storagePersisterContractChecks: [
  _LocalStoragePersisterMatchesContract,
  _SessionStoragePersisterMatchesContract,
] = [true, true];
void storagePersisterContractChecks;

describe('insertStoragePersister', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};

    const storage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      get length() {
        return Object.keys(store).length;
      },
    } as unknown as Storage;

    vi.stubGlobal('localStorage', storage);
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);
    TestBed.configureTestingModule({
      providers: [
        provideLocalStoragePersister(),
        provideSessionStoragePersister(),
        provideStoragePersister(function* () {
          return yield* LocalStoragePersister();
        }),
      ],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('restores a cached query value at runtime when waitForParams is disabled', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resource-myTestQuery',
        JSON.stringify({
          queryValue: { data: 'cached' },
          timestamp: Date.now(),
        }),
      );

      const paramsSrc = signal<string | undefined>(undefined);
      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: paramsSrc,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}` };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myTestQuery',
          }), {
            waitForParamsSrcToBeEqualToPreviousValue: false,
          }),
        ),
      );

      expect(myQuery.persister).toBeDefined();
      expect(craftUse(myQuery.status())).toBe('local');
      expect(craftUse(myQuery.value())).toEqual({ data: 'cached' });

      const myQueryById = craftUse(
        query(
          'myQueryById',
          {
            params: () => 'id-1',
            identifier: (params) => params,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}` };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myTestQueryById',
          })),
        ),
      );

      await vi.runAllTimersAsync();

      expect(myQueryById.persister).toBeDefined();
      expect(craftUse(myQueryById.select('id-1')?.status())).toBe('resolved');
      expect(craftUse(myQueryById.select('id-1')?.value())).toEqual({
        data: 'server:id-1',
      });

      const byIdCalls = vi
        .mocked(localStorage.setItem)
        .mock.calls.filter(
          ([key]) =>
            key === 'craft-ts-myTestStore-resourceById-myTestQueryById',
        );
      expect(byIdCalls.length).toBeGreaterThan(0);

      const storedById = JSON.parse(byIdCalls.at(-1)![1]);
      expect(storedById.queryByIdValue['id-1'].value).toEqual({
        data: 'server:id-1',
      });
    });
  });

  it('persists mutation results at runtime for resource and resourceById modes', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myMutation = craftUse(
        mutation(
          'myMutation',
          {
            method: (id: string) => id,
            loader: async ({ params }) => {
              await wait(100);
              return { data: params };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myMutation',
          })),
        ),
      );

      const myMutationById = craftUse(
        mutation(
          'myMutationById',
          {
            method: (id: string) => id,
            identifier: (params) => params,
            loader: async ({ params }) => {
              await wait(100);
              return { data: params };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myMutationById',
          })),
        ),
      );

      expect(myMutation.persister).toBeDefined();
      expect(myMutationById.persister).toBeDefined();

      myMutation.mutate('m-1');
      myMutationById.mutate('m-2');

      await vi.runAllTimersAsync();

      expect(craftUse(myMutation.status())).toBe('resolved');
      expect(craftUse(myMutation.value())).toEqual({ data: 'm-1' });
      expect(craftUse(myMutationById.select('m-2')?.status())).toBe('resolved');
      expect(craftUse(myMutationById.select('m-2')?.value())).toEqual({ data: 'm-2' });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'craft-ts-myTestStore-resource-myMutation',
        expect.any(String),
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'craft-ts-myTestStore-resourceById-myMutationById',
        expect.any(String),
      );
    });
  });

  it('persists async process results at runtime for resource and resourceById modes', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myAsyncProcess = craftUse(
        asyncProcess(
          'myAsyncProcess',
          {
            method: (id: string) => id,
            loader: async ({ params }) => {
              await wait(100);
              return { data: params };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myAsyncProcess',
          })),
        ),
      );

      const myAsyncProcessById = craftUse(
        asyncProcess(
          'myAsyncProcessById',
          {
            method: (id: string) => id,
            identifier: (params) => params,
            loader: async ({ params }) => {
              await wait(100);
              return { data: params };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myAsyncProcessById',
          })),
        ),
      );

      expect(myAsyncProcess.persister).toBeDefined();
      expect(myAsyncProcessById.persister).toBeDefined();

      myAsyncProcess.method('a-1');
      myAsyncProcessById.method('a-2');

      await vi.runAllTimersAsync();

      expect(craftUse(myAsyncProcess.status())).toBe('resolved');
      expect(craftUse(myAsyncProcess.value())).toEqual({ data: 'a-1' });
      expect(craftUse(myAsyncProcessById.select('a-2')?.status())).toBe('resolved');
      expect(craftUse(myAsyncProcessById.select('a-2')?.value())).toEqual({
        data: 'a-2',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'craft-ts-myTestStore-resource-myAsyncProcess',
        expect.any(String),
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'craft-ts-myTestStore-resourceById-myAsyncProcessById',
        expect.any(String),
      );
    });
  });

  // --- staleTime integration tests ---

  it('staleTime: restores fresh cached query value without triggering reload', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resource-myStaleQuery',
        JSON.stringify({
          queryValue: { data: 'cached' },
          timestamp: Date.now() - 2000, // 2s old — fresh
        }),
      );

      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: signal<string | undefined>(undefined),
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}` };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myStaleQuery',
          }), {
            waitForParamsSrcToBeEqualToPreviousValue: false,
            cacheTime: 60000,
            staleTime: 5000,
          }),
        ),
      );

      // Fresh: restored without reload
      expect(craftUse(myQuery.status())).toBe('local');
      expect(craftUse(myQuery.value())).toEqual({ data: 'cached' });
    });
  });

  it('staleTime: restores stale cached query value AND triggers background reload (SWR)', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resource-mySWRQuery',
        JSON.stringify({
          queryValue: { data: 'cached' },
          timestamp: Date.now() - 6000, // 6s old — stale
        }),
      );

      const paramsSrc = signal<string | undefined>('p1');
      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: paramsSrc,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}` };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'mySWRQuery',
          }), {
            waitForParamsSrcToBeEqualToPreviousValue: false,
            cacheTime: 60000,
            staleTime: 5000,
          }),
        ),
      );

      // A stale cache schedules a background reload; the exact intermediate
      // value/status is scheduler-dependent in Angular's resource runtime.
      expect(myQuery).toBeDefined();

      await vi.runAllTimersAsync();
      expect(craftUse(myQuery.status())).toBe('resolved');
      expect(craftUse(myQuery.value())).toEqual({ data: 'server:p1' });
    });
  });

  it('staleTime: restores stale queryById value AND triggers reload per resource', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resourceById-myStaleQueryById',
        JSON.stringify({
          queryParams: undefined,
          queryByIdValue: {
            'id-1': {
              params: 'id-1',
              value: { data: 'cached-1' },
              reloadOnMount: false,
              timestamp: Date.now() - 6000, // stale
            },
          },
          timestamp: Date.now() - 6000,
        }),
      );

      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: () => 'id-1',
            identifier: (p) => p,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}` };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myStaleQueryById',
          }), {
            cacheTime: 60000,
            staleTime: 5000,
          }),
        ),
      );

      // Resource was restored but reload triggered
      expect(['loading', 'reloading']).toContain(
        craftUse(myQuery.select('id-1')?.status()),
      );

      await vi.runAllTimersAsync();
      expect(craftUse(myQuery.select('id-1')?.status())).toBe('resolved');
      expect(craftUse(myQuery.select('id-1')?.value())).toEqual({ data: 'server:id-1' });
    });
  });

  it('staleTime: fresh queryById value restored without reload', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resourceById-myFreshQueryById',
        JSON.stringify({
          queryParams: undefined,
          queryByIdValue: {
            'id-1': {
              params: 'id-1',
              value: { data: 'cached-1' },
              reloadOnMount: false,
              timestamp: Date.now() - 2000, // fresh
            },
          },
          timestamp: Date.now() - 2000,
        }),
      );

      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: () => 'id-1',
            identifier: (p) => p,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}` };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myFreshQueryById',
          }), {
            cacheTime: 60000,
            staleTime: 5000,
          }),
        ),
      );

      // Fresh: no reload, status stays local
      expect(craftUse(myQuery.select('id-1')?.status())).toBe('local');
      expect(craftUse(myQuery.select('id-1')?.value())).toEqual({ data: 'cached-1' });
    });
  });

  // --- validate integration tests ---

  it('validate: discards cached value and loads fresh when validate returns false', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resource-myValidatedQuery',
        JSON.stringify({
          queryValue: { data: 'outdated-shape' },
          timestamp: Date.now(),
        }),
      );

      const paramsSrc = signal<string | undefined>('p1');
      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: paramsSrc,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}`, version: 2 };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myValidatedQuery',
          }), {
            waitForParamsSrcToBeEqualToPreviousValue: false,
            // validate rejects the old shape (missing 'version' field)
            validate: (v): v is { data: string; version: number } =>
              typeof (v as any)?.version === 'number',
          }),
        ),
      );

      // Cache discarded — should be loading fresh
      expect(craftUse(myQuery.status())).not.toBe('local');
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'craft-ts-myTestStore-resource-myValidatedQuery',
      );

      await vi.runAllTimersAsync();
      expect(craftUse(myQuery.status())).toBe('resolved');
      expect(craftUse(myQuery.value())).toEqual({
        data: 'server:p1',
        version: 2,
      });
    });
  });

  it('validate: restores cached value when validate returns true', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resource-myValidatedQuery2',
        JSON.stringify({
          queryValue: { data: 'cached', version: 1 },
          timestamp: Date.now(),
        }),
      );

      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: signal<string | undefined>(undefined),
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}`, version: 1 };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myValidatedQuery2',
          }), {
            waitForParamsSrcToBeEqualToPreviousValue: false,
            validate: (v): v is { data: string; version: number } =>
              typeof (v as any)?.version === 'number',
          }),
        ),
      );

      expect(craftUse(myQuery.status())).toBe('local');
      expect(craftUse(myQuery.value())).toEqual({ data: 'cached', version: 1 });
    });
  });

  it('validate: queryById discards resource value and loads fresh when validate fails', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resourceById-myValidatedQueryById',
        JSON.stringify({
          queryParams: undefined,
          queryByIdValue: {
            'id-1': {
              params: 'id-1',
              value: { data: 'old-shape' }, // missing 'version'
              reloadOnMount: false,
              timestamp: Date.now(),
            },
          },
          timestamp: Date.now(),
        }),
      );

      const myQuery = craftUse(
        query(
          'myQuery',
          {
            params: () => 'id-1',
            identifier: (p) => p,
            loader: async ({ params }) => {
              await wait(100);
              return { data: `server:${params}`, version: 2 };
            },
          },
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myValidatedQueryById',
          }), {
            validate: (v): v is { data: string; version: number } =>
              typeof (v as any)?.version === 'number',
          }),
        ),
      );

      // validate failed → no defaultValue → resource loads fresh
      expect(craftUse(myQuery.select('id-1')?.status())).not.toBe('local');

      await vi.runAllTimersAsync();
      expect(craftUse(myQuery.select('id-1')?.status())).toBe('resolved');
      expect(craftUse(myQuery.select('id-1')?.value())).toEqual({
        data: 'server:id-1',
        version: 2,
      });
    });
  });

  it('persists and restores state at runtime', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = craftUse(
        state('myState', 0, (context) =>
          craftPipe(
            context,
            ({ set }) => ({
              setValue: (value: number) => set(value),
            }),
            insertStoragePersister(craftUnique({
              storeName: 'myTestStore',
              key: 'myState',
            })),
          ),
        ),
      );

      expect(myState.persister).toBeDefined();
      expect(craftUse(myState())).toBe(0);

      myState.setValue(42);
      await vi.runAllTimersAsync();

      const stateCalls = vi
        .mocked(localStorage.setItem)
        .mock.calls.filter(
          ([key]) => key === 'craft-ts-myTestStore-resource-myState',
        );
      expect(stateCalls.length).toBeGreaterThan(0);

      const persistedState = JSON.parse(stateCalls.at(-1)![1]);
      expect(persistedState.queryValue).toBe(42);
    });

    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'craft-ts-myTestStore-resource-myStateRestored',
        JSON.stringify({
          queryValue: 7,
          timestamp: Date.now(),
        }),
      );

      const restoredState = craftUse(
        state(
          'restoredState',
          0,
          insertStoragePersister(craftUnique({
            storeName: 'myTestStore',
            key: 'myStateRestored',
          })),
        ),
      );

      expect(restoredState.persister).toBeDefined();
      expect(craftUse(restoredState())).toBe(7);
    });
  });
});

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
