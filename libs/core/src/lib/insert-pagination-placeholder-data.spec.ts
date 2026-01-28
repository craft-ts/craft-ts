import { computed, ResourceStatus, signal, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { query } from './query';
import { insertPaginationPlaceholderData } from './insert-pagination-placeholder-data';

describe('insertPaginationPlaceholderData', () => {
  it('should return the data of the currentPage', () => {
    TestBed.runInInjectionContext(() => {
      const finalResult = query(
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
        insertPaginationPlaceholderData,
      );

      expectTypeOf(finalResult.currentPageData).toEqualTypeOf<
        Signal<
          | {
              id: string;
              name: string;
            }
          | undefined
        >
      >();
      expectTypeOf(finalResult.currentPageStatus).toEqualTypeOf<
        Signal<ResourceStatus>
      >();
      expectTypeOf(finalResult.isPlaceHolderData).toEqualTypeOf<
        Signal<boolean>
      >();
    });
  });

  it('should return a placeholder data during loading', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const pagination = signal(1);
      const userQuery = query(
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
        insertPaginationPlaceholderData,
      );

      expect(userQuery.currentPageData()).toEqual(undefined);
      await vi.advanceTimersByTimeAsync(15000);
      console.log('userQuery.currentPageData()', userQuery.currentPageData());
      expect(userQuery.currentPageData()).toEqual([{ name: 'User1' }]);
      pagination.set(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(userQuery.currentPageData()).toEqual([{ name: 'User1' }]);
      expect(userQuery.currentPageStatus()).toEqual('loading');
      await vi.advanceTimersByTimeAsync(7000);
      expect(userQuery.currentPageData()).toEqual([{ name: 'User2' }]);
      expect(userQuery.currentPageStatus()).toEqual('resolved');

      vi.restoreAllMocks();
    });
  });
});

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
