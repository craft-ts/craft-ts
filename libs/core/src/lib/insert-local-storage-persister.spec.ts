import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncProcess } from './async-process';
import { insertLocalStoragePersister } from './insert-local-storage-persister';
import { mutation } from './mutation';
import { query } from './query';
import { state } from './state';

describe('insertLocalStoragePersister', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};

    vi.stubGlobal('localStorage', {
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
        'ng-craft-myTestStore-resource-myTestQuery',
        JSON.stringify({
          queryValue: { data: 'cached' },
          timestamp: Date.now(),
        }),
      );

      const paramsSrc = signal<string | undefined>(undefined);
      const myQuery = query(
        {
          params: paramsSrc,
          loader: async ({ params }) => {
            await wait(100);
            return { data: `server:${params}` };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myTestQuery',
          waitForParamsSrcToBeEqualToPreviousValue: false,
        }),
      );

      expect(myQuery.persister).toBeDefined();
      expect(myQuery.status()).toBe('local');
      expect(myQuery.value()).toEqual({ data: 'cached' });

      const myQueryById = query(
        {
          params: () => 'id-1',
          identifier: (params) => params,
          loader: async ({ params }) => {
            await wait(100);
            return { data: `server:${params}` };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myTestQueryById',
        }),
      );

      await vi.runAllTimersAsync();

      expect(myQueryById.persister).toBeDefined();
      expect(myQueryById.select('id-1')?.status()).toBe('resolved');
      expect(myQueryById.select('id-1')?.value()).toEqual({
        data: 'server:id-1',
      });

      const byIdCalls = vi
        .mocked(localStorage.setItem)
        .mock.calls.filter(
          ([key]) => key === 'ng-craft-myTestStore-resourceById-myTestQueryById',
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
      const myMutation = mutation(
        {
          method: (id: string) => id,
          loader: async ({ params }) => {
            await wait(100);
            return { data: params };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myMutation',
        }),
      );

      const myMutationById = mutation(
        {
          method: (id: string) => id,
          identifier: (params) => params,
          loader: async ({ params }) => {
            await wait(100);
            return { data: params };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myMutationById',
        }),
      );

      expect(myMutation.persister).toBeDefined();
      expect(myMutationById.persister).toBeDefined();

      myMutation.mutate('m-1');
      myMutationById.mutate('m-2');

      await vi.runAllTimersAsync();

      expect(myMutation.status()).toBe('resolved');
      expect(myMutation.value()).toEqual({ data: 'm-1' });
      expect(myMutationById.select('m-2')?.status()).toBe('resolved');
      expect(myMutationById.select('m-2')?.value()).toEqual({ data: 'm-2' });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'ng-craft-myTestStore-resource-myMutation',
        expect.any(String),
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'ng-craft-myTestStore-resourceById-myMutationById',
        expect.any(String),
      );
    });
  });

  it('persists async process results at runtime for resource and resourceById modes', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myAsyncProcess = asyncProcess(
        {
          method: (id: string) => id,
          loader: async ({ params }) => {
            await wait(100);
            return { data: params };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myAsyncProcess',
        }),
      );

      const myAsyncProcessById = asyncProcess(
        {
          method: (id: string) => id,
          identifier: (params) => params,
          loader: async ({ params }) => {
            await wait(100);
            return { data: params };
          },
        },
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myAsyncProcessById',
        }),
      );

      expect(myAsyncProcess.persister).toBeDefined();
      expect(myAsyncProcessById.persister).toBeDefined();

      myAsyncProcess.method('a-1');
      myAsyncProcessById.method('a-2');

      await vi.runAllTimersAsync();

      expect(myAsyncProcess.status()).toBe('resolved');
      expect(myAsyncProcess.value()).toEqual({ data: 'a-1' });
      expect(myAsyncProcessById.select('a-2')?.status()).toBe('resolved');
      expect(myAsyncProcessById.select('a-2')?.value()).toEqual({
        data: 'a-2',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'ng-craft-myTestStore-resource-myAsyncProcess',
        expect.any(String),
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'ng-craft-myTestStore-resourceById-myAsyncProcessById',
        expect.any(String),
      );
    });
  });

  it('persists and restores state at runtime', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myState = state(
        0,
        ({ set }) => ({
          setValue: (value: number) => set(value),
        }),
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myState',
        }),
      );

      expect(myState.persister).toBeDefined();
      expect(myState()).toBe(0);

      myState.setValue(42);
      await vi.runAllTimersAsync();

      const stateCalls = vi
        .mocked(localStorage.setItem)
        .mock.calls.filter(
          ([key]) => key === 'ng-craft-myTestStore-resource-myState',
        );
      expect(stateCalls.length).toBeGreaterThan(0);

      const persistedState = JSON.parse(stateCalls.at(-1)![1]);
      expect(persistedState.queryValue).toBe(42);
    });

    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-myTestStore-resource-myStateRestored',
        JSON.stringify({
          queryValue: 7,
          timestamp: Date.now(),
        }),
      );

      const restoredState = state(
        0,
        insertLocalStoragePersister({
          storeName: 'myTestStore',
          key: 'myStateRestored',
        }),
      );

      expect(restoredState.persister).toBeDefined();
      expect(restoredState()).toBe(7);
    });
  });
});

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
