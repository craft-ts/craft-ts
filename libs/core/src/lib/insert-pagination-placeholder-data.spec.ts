import { computed, signal, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { query } from './query';
import { insertPaginationPlaceholderData } from './insert-pagination-placeholder-data';
import { craftUse } from './craft-use';
import type { CraftResourceStatus } from './util/craft-resource-status';
import type { NamedYieldableValue } from './yieldable';

describe('insertPaginationPlaceholderData', () => {
  it('should return the data of the currentPage', () => {
    TestBed.runInInjectionContext(() => {
      const finalResult = craftUse(query(
          'finalResult',
          {
            params: () => ({
              id: '1',
            }),
            identifier: (params) => params.id,
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Test Name',
              };
            },
          },
          insertPaginationPlaceholderData({
            initialValue: { id: '', name: '' },
          }),
        ),
      );

      // initialValue drives the type: currentPageData is never undefined
      expectTypeOf(finalResult.currentPageData).toEqualTypeOf<
        NamedYieldableValue<'currentPageData', Signal<{
          id: string;
          name: string;
        }>>
      >();
      expectTypeOf(finalResult.currentPageStatus).toEqualTypeOf<
        NamedYieldableValue<'currentPageStatus', Signal<CraftResourceStatus>>
      >();
      expectTypeOf(finalResult.isPlaceHolderData).toEqualTypeOf<
        NamedYieldableValue<'isPlaceHolderData', Signal<boolean>>
      >();

      expectTypeOf(finalResult.currentIdentifier).toEqualTypeOf<
        NamedYieldableValue<'currentIdentifier', Signal<string>>
      >();
    });
  });

  it('should return a placeholder data during loading', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const pagination = signal(1);
      const userQuery = craftUse(query(
          'userQuery',
          {
            params: pagination,
            identifier: (params) => '' + params,
            loader: async ({ params: pagination }) => {
              await wait(10000);
              return [
                {
                  name: 'User' + pagination,
                },
              ];
            },
          },
          insertPaginationPlaceholderData({
            initialValue: [] as { name: string }[],
          }),
        ),
      );

      // initialValue is returned instead of undefined before the first load
      expect(userQuery.currentPageData()).toEqual([]);
      await vi.advanceTimersByTimeAsync(15000);
      expect(userQuery.currentPageData()).toEqual([{ name: 'User1' }]);
      expect(userQuery.currentIdentifier()).toEqual('1');
      pagination.set(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(userQuery.currentPageData()).toEqual([{ name: 'User1' }]);
      expect(userQuery.currentPageStatus()).toEqual('loading');
      expect(userQuery.currentIdentifier()).toEqual('2');
      await vi.advanceTimersByTimeAsync(7000);
      expect(userQuery.currentPageData()).toEqual([{ name: 'User2' }]);
      expect(userQuery.currentPageStatus()).toEqual('resolved');

      vi.restoreAllMocks();
    });
  });

  it('should expose custom outputs via build and only mutate the current page', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      type Item = { id: string; name: string; completed: boolean };
      const pagination = signal(1);
      const userQuery = craftUse(query(
          'userQuery',
          {
            params: pagination,
            identifier: (params) => '' + params,
            loader: async ({ params: page }) => {
              await wait(1000);
              return [
                { id: `${page}-a`, name: 'User' + page, completed: false },
              ] as Item[];
            },
          },
          insertPaginationPlaceholderData(
            { initialValue: [] as Item[] },
            ({ state, update }) => ({
              uncompletedCount: computed(
                () => state().filter((d) => !d.completed).length,
              ),
              markFirstCompleted: () =>
                update((list) =>
                  list.map((d, i) => (i === 0 ? { ...d, completed: true } : d)),
                ),
            }),
          ),
        ),
      );

      // computed output is typed and a Signal
      expectTypeOf(userQuery.uncompletedCount).toEqualTypeOf<
        NamedYieldableValue<'uncompletedCount', Signal<number>>
      >();

      // load page 1
      await vi.advanceTimersByTimeAsync(2000);
      expect(userQuery.currentPageData()).toEqual([
        { id: '1-a', name: 'User1', completed: false },
      ]);
      expect(userQuery.uncompletedCount()).toBe(1);

      // load page 2
      pagination.set(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(userQuery.currentPageData()).toEqual([
        { id: '2-a', name: 'User2', completed: false },
      ]);
      expect(userQuery.uncompletedCount()).toBe(1);

      // mutate the current page (page 2) via the build method
      userQuery.markFirstCompleted();
      expect(userQuery.currentPageData()).toEqual([
        { id: '2-a', name: 'User2', completed: true },
      ]);
      expect(userQuery.uncompletedCount()).toBe(0);

      // go back to page 1: it must NOT have been reset by the page-2 mutation
      pagination.set(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(userQuery.currentPageData()).toEqual([
        { id: '1-a', name: 'User1', completed: false },
      ]);
      expect(userQuery.uncompletedCount()).toBe(1);

      vi.restoreAllMocks();
    });
  });
});

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
