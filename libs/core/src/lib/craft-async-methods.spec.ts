import { TestBed } from '@angular/core/testing';
import { craft } from './craft';
import { craftAsyncMethods } from './craft-async-methods';
import { asyncMethod } from './async-method';
import { source } from './source';
import { afterRecomputation } from './after-recomputation';
import { craftSources } from './craft-sources';

describe('craftAsyncMethods', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to define async method', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftAsyncMethods(() => ({
          // should enable to provide multiples status
          // should provide async method by id
          searchChange: asyncMethod({
            method: ({
              timeToWait,
              searchChange,
            }: {
              timeToWait: number;
              searchChange: string;
            }) => ({
              timeToWait,
              searchChange,
            }),
            loader: async ({ params: { timeToWait, searchChange } }) => {
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          }),
        }))
      );
      const store = injectCraft();
      expect(store.searchChange.status()).toBe('idle');
      store.setSearchChange({
        searchChange: 'test',
        timeToWait: 1000,
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(store.searchChange.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(store.searchChange.status()).toBe('resolved');
      expect(store.searchChange.value()).toEqual({ searchChange: 'test' });
    });
  });

  it('should enable to define async methods bind to a local and global source', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myGlobalSource = source<{
        timeToWait: number;
        searchChange: string;
      }>();
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftSources({
          myLocalSource: source<{
            timeToWait: number;
            searchChange: string;
          }>(),
        }),
        craftAsyncMethods(({ myLocalSource }) => ({
          searchGlobalChange: asyncMethod({
            method: afterRecomputation(myGlobalSource, (payload) => payload),
            loader: async ({ params: { timeToWait, searchChange } }) => {
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          }),
          searchLocalChange: asyncMethod({
            method: afterRecomputation(myLocalSource, (payload) => payload),
            loader: async ({ params: { timeToWait, searchChange } }) => {
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          }),
        }))
      );
      const store = injectCraft();
      expect(store.searchGlobalChange.status()).toBe('idle');
      await vi.runAllTimersAsync();
      myGlobalSource.set({
        searchChange: 'global',
        timeToWait: 1000,
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(store.searchGlobalChange.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(store.searchGlobalChange.status()).toBe('resolved');
      expect(store.searchGlobalChange.value()).toEqual({
        searchChange: 'global',
      });

      expect(store.searchLocalChange.status()).toBe('idle');
      store.setMyLocalSource({
        searchChange: 'local',
        timeToWait: 1000,
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(store.searchLocalChange.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(store.searchLocalChange.status()).toBe('resolved');
      expect(store.searchLocalChange.value()).toEqual({
        searchChange: 'local',
      });
    });
  });
});

describe('usingAsyncMethods with identifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to define async method', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftAsyncMethods(() => ({
          // should enable to provide multiples status
          // should provide async method by id
          searchChange: asyncMethod({
            method: ({
              timeToWait,
              searchChange,
            }: {
              timeToWait: number;
              searchChange: string;
            }) => ({
              timeToWait,
              searchChange,
            }),
            identifier: (params) => params.searchChange,
            loader: async ({ params: { timeToWait, searchChange } }) => {
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          }),
        }))
      );
      const store = injectCraft();
      store.setSearchChange({
        searchChange: 'test',
        timeToWait: 1000,
      });
      await vi.advanceTimersByTimeAsync(500);

      expect(store.searchChange.select('test')?.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(store.searchChange.select('test')?.status()).toBe('resolved');
      expect(store.searchChange.select('test')?.value()).toEqual({
        searchChange: 'test',
      });
    });
  });

  it('should enable to define async methods bind to a local and global source', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myGlobalSource = source<{
        timeToWait: number;
        searchChange: string;
      }>();
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftSources({
          myLocalSource: source<{
            timeToWait: number;
            searchChange: string;
          }>(),
        }),
        craftAsyncMethods(({ myLocalSource }) => ({
          searchGlobalChange: asyncMethod({
            method: afterRecomputation(myGlobalSource, (payload) => {
              console.log('payload', payload);
              return payload;
            }),
            identifier: (params) => params.searchChange,
            loader: async ({ params: { timeToWait, searchChange } }) => {
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          }),
        }))
      );
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expect(store.searchGlobalChange.select('global')?.status()).toBe(
        undefined
      );
      myGlobalSource.set({
        searchChange: 'global',
        timeToWait: 1000,
      });

      await vi.advanceTimersByTimeAsync(500);

      expect(store.searchGlobalChange.select('global')?.status()).toBe(
        'loading'
      );
      await vi.runAllTimersAsync();
      expect(store.searchGlobalChange.select('global')?.status()).toBe(
        'resolved'
      );
      expect(store.searchGlobalChange.select('global')?.value()).toEqual({
        searchChange: 'global',
      });

      // expect(store.searchLocalChange.select('local')?.status()).toBe('idle');
      // store.setMyLocalSource({
      //   searchChange: 'local',
      //   timeToWait: 1000,
      // });
      // await vi.advanceTimersByTimeAsync(500);
      // expect(store.searchLocalChange.select('local')?.status()).toBe('loading');
      // await vi.runAllTimersAsync();
      // expect(store.searchLocalChange.select('local')?.status()).toBe(
      //   'resolved'
      // );
      // expect(store.searchLocalChange.select('local')?.value()).toEqual({
      //   searchChange: 'local',
      // });
    });
  });
});
