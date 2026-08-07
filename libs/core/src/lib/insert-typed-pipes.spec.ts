import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { computed, Signal } from '@angular/core';
import {
  insertAsyncProcessPipe,
  insertMutationPipe,
  insertQueryParamsPipe,
  insertQueryPipe,
  insertStatePipe,
} from './insert-typed-pipes';
import { asyncProcess } from './async-process';
import { craftUse } from './craft-use';
import { mutation } from './mutation';
import { query } from './query';
import { queryParams } from './query-params';
import { state } from './state';

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

describe('typed insertion pipes', () => {
  it('composes state insertions, exposes previous outputs, and supports generators', () => {
    TestBed.runInInjectionContext(() => {
      const executionOrder: string[] = [];
      const counter = craftUse(state(
          'counter',
          0,
          insertStatePipe(
            function* () {
              executionOrder.push('first');
              return { first: 1 };
            },
            ({ state: value, insertions }) => {
              executionOrder.push('second');
              expectTypeOf(insertions.first).toEqualTypeOf<number>();
              return {
                second: computed(() => value() + insertions.first),
              };
            },
          ),
        ),
      );

      expect(executionOrder).toEqual(['first', 'second']);
      expectTypeOf(counter.first).toEqualTypeOf<number>();
      expectTypeOf(counter.second).toMatchTypeOf<Signal<number>>();
      expect(counter.first).toBe(1);
      expect(counter.second()).toBe(1);
    });
  });

  it('composes query insertions without an explicit context', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(query(
          'users',
          {
            params: () => 'user-1',
            loader: async () => ({ id: 'user-1' }),
          },
          insertQueryPipe(
            () => ({ first: 'user' }),
            ({ insertions }) => ({ second: `${insertions.first}-query` }),
          ),
        ),
      );

      expectTypeOf(users.first).toEqualTypeOf<string>();
      expectTypeOf(users.second).toEqualTypeOf<string>();
      await Promise.resolve();
      expect(users.first).toBe('user');
      expect(users.second).toBe('user-query');
    });
  });

  it('composes mutation insertions without an explicit context', () => {
    TestBed.runInInjectionContext(() => {
      const save = craftUse(mutation(
          'save',
          {
            method: (value: string) => ({ value }),
            loader: async ({ params }) => ({ value: params }),
          },
          insertMutationPipe(
            () => ({ first: 'mutation' }),
            ({ insertions }) => ({ second: insertions.first.length }),
          ),
        ),
      );

      expectTypeOf(save.first).toEqualTypeOf<string>();
      expectTypeOf(save.second).toEqualTypeOf<number>();
      expect(save.first).toBe('mutation');
      expect(save.second).toBe(8);
    });
  });

  it('composes queryParams insertions without an explicit context', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.runInInjectionContext(() => {
      const pagination = craftUse(queryParams(
          'pagination',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => Number(value),
                  encode: (value: number) => String(value),
                },
              },
            },
          },
          insertQueryParamsPipe(
            ({ state }) => ({ currentPage: computed(() => state().page) }),
            ({ insertions }) => ({
              nextPage: () => insertions.currentPage() + 1,
            }),
          ),
        ),
      );

      expectTypeOf(pagination.currentPage).toMatchTypeOf<Signal<number>>();
      expectTypeOf(pagination.nextPage).toBeFunction();
      expect(pagination.currentPage()).toBe(1);
      expect(craftUse(pagination.nextPage())).toBe(2);
    });
  });

  it('composes asyncProcess insertions without an explicit context', () => {
    TestBed.runInInjectionContext(() => {
      const process = craftUse(asyncProcess(
          'process',
          {
            method: (value: string) => value,
            loader: async ({ params }) => ({ value: params }),
          },
          insertAsyncProcessPipe(
            () => ({ first: 'async' }),
            ({ insertions }) => ({ second: insertions.first.length }),
          ),
        ),
      );

      expectTypeOf(process.first).toEqualTypeOf<string>();
      expectTypeOf(process.second).toEqualTypeOf<number>();
      expect(process.first).toBe('async');
      expect(process.second).toBe(5);
    });
  });
});
