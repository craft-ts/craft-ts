import { craftQuery } from './craft-query';
import { craft } from './craft';
import { query } from './query';
import { Injectable, InjectionToken, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftInject } from './craft-inject';

describe('craftInject', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('1- Should expose a way to use injectable services', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      myParams = signal('1');
    }
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftInject(() => ({
          MyService,
        })),
        craftQuery('user', ({ myService }) => {
          return query({
            params: myService.myParams,
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          });
        }),
      );
      const store = injectCraft();

      expect(store.user).toBeDefined();
      await vi.runAllTimersAsync();
      expect(store.user.value()).toEqual({
        id: '1',
        name: 'John Doe',
        email: 'test@a.com',
      });
    });
  });

  it('2- Should expose a way to set injectable with generics', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService<T> {
      myParams = signal('1');
      getValue(): T {
        return '1' as T;
      }
    }
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftInject(() => ({
          MyService: MyService<{ id: string }>,
        })),
        craftQuery('user', ({ myService }) => {
          expectTypeOf<typeof myService>().toEqualTypeOf<
            MyService<{ id: string }>
          >();
          return query({
            params: () => myService.getValue(),
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          });
        }),
      );
      const store = injectCraft();

      expect(store.user).toBeDefined();
      await vi.runAllTimersAsync();
      expect(store.user.value()).toEqual({
        id: '1',
        name: 'John Doe',
        email: 'test@a.com',
      });
    });
  });

  it('3- Should expose a way to set injectable with injection tokens', async () => {
    const MyToken = new InjectionToken('MyToken', {
      providedIn: 'root',
      factory: () => ({ id: '1' }),
    });

    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftInject(() => ({
          MyToken: MyToken,
        })),
        craftQuery('user', ({ myToken }) => {
          expectTypeOf<typeof myToken>().toEqualTypeOf<{ id: string }>();
          return query({
            params: () => myToken,
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          });
        }),
      );
      const store = injectCraft();

      expect(store.user).toBeDefined();
      await vi.runAllTimersAsync();
      expect(store.user.value()).toEqual({
        id: '1',
        name: 'John Doe',
        email: 'test@a.com',
      });
    });
  });
});
