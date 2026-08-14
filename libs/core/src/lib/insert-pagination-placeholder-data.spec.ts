import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { query } from './query';
import { insertPaginationPlaceholderData } from './insert-pagination-placeholder-data';
import { craftUse } from './craft-use';
import {
  CraftNotSettled,
  type CraftSettledSourcesOf,
} from './craft-settled';
import type { CraftResourceStatus } from './util/craft-resource-status';
import type { YieldableReactiveValue } from './reactive-read';

describe('insertPaginationPlaceholderData', () => {
  it('should return the data of the currentPage', () => {
    TestBed.runInInjectionContext(() => {
      const finalResult = craftUse(
        query(
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
      expectTypeOf(finalResult.currentPageData).toMatchTypeOf<
        YieldableReactiveValue<{ id: string; name: string }>
      >();
      expectTypeOf(finalResult.currentPageStatus).toMatchTypeOf<
        YieldableReactiveValue<CraftResourceStatus>
      >();
      expectTypeOf<
        CraftSettledSourcesOf<typeof finalResult.currentPageStatus>
      >().toEqualTypeOf<'finalResult'>();
      expectTypeOf(finalResult.isPlaceHolderData).toMatchTypeOf<
        YieldableReactiveValue<boolean>
      >();

      expectTypeOf(finalResult.currentIdentifier).toMatchTypeOf<
        YieldableReactiveValue<string>
      >();
    });
  });

  it('should return a placeholder data during loading', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const pagination = signal(1);
      const userQuery = craftUse(
        query(
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
      expect(craftUse(userQuery.currentPageData())).toEqual([]);
      expect(() => craftUse(userQuery.currentPageStatus())).toThrow(
        CraftNotSettled,
      );
      await vi.advanceTimersByTimeAsync(15000);
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { name: 'User1' },
      ]);
      expect(craftUse(userQuery.currentIdentifier())).toEqual('1');
      pagination.set(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { name: 'User1' },
      ]);
      expect(() => craftUse(userQuery.currentPageStatus())).toThrow(
        CraftNotSettled,
      );
      expect(craftUse(userQuery.currentIdentifier())).toEqual('2');
      await vi.advanceTimersByTimeAsync(7000);
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { name: 'User2' },
      ]);
      expect(craftUse(userQuery.currentPageStatus())).toEqual('resolved');

      vi.restoreAllMocks();
    });
  });

  it('should expose custom outputs via build and only mutate the current page', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      type Item = { id: string; name: string; completed: boolean };
      const pagination = signal(1);
      const userQuery = craftUse(
        query(
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
            ({ state, settledState, update }) => ({
              uncompletedCount: computed(
                () => craftUse(state()).filter((d) => !d.completed).length,
              ),
              settledCount: computed(
                () => craftUse(settledState()).length,
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
      expectTypeOf(userQuery.uncompletedCount).toMatchTypeOf<
        YieldableReactiveValue<number>
      >();

      // load page 1
      await vi.advanceTimersByTimeAsync(2000);
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { id: '1-a', name: 'User1', completed: false },
      ]);
      expect(craftUse(userQuery.uncompletedCount())).toBe(1);
      expect(craftUse(userQuery.settledCount())).toBe(1);

      // load page 2
      pagination.set(2);
      expect(() => craftUse(userQuery.settledCount())).toThrow(
        CraftNotSettled,
      );
      await vi.advanceTimersByTimeAsync(2000);
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { id: '2-a', name: 'User2', completed: false },
      ]);
      expect(craftUse(userQuery.uncompletedCount())).toBe(1);

      // mutate the current page (page 2) via the build method
      userQuery.markFirstCompleted();
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { id: '2-a', name: 'User2', completed: true },
      ]);
      expect(craftUse(userQuery.uncompletedCount())).toBe(0);
      expect(craftUse(userQuery.settledCount())).toBe(1);

      // go back to page 1: it must NOT have been reset by the page-2 mutation
      pagination.set(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(craftUse(userQuery.currentPageData())).toEqual([
        { id: '1-a', name: 'User1', completed: false },
      ]);
      expect(craftUse(userQuery.uncompletedCount())).toBe(1);

      vi.restoreAllMocks();
    });
  });
});

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
