import { TestBed } from '@angular/core/testing';
import { craft } from './craft';
import { craftQueryParam } from './craft-query-param';
import { craftSetAllQueriesParamsStandalone } from './craft-set-all-queries-params-standalone';
import { Prettify } from './util/util.type';
import { queryParam } from './query-param';
import { Component, inject } from '@angular/core';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Location } from '@angular/common';

@Component({
  template: '',
  standalone: true,
})
class TestComponent {
  route = inject(ActivatedRoute);
}
describe('craftSetAllQueriesParamsStandalone', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'test', component: TestComponent }])],
    });
  });
  it('should create query params configuration', () => {
    const { injectTestStoreCraft, setAllTestStoreQueryParams } = craft(
      {
        providedIn: 'root',
        name: 'TestStore',
      },
      craftQueryParam('pagination', () =>
        queryParam(
          {
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
              pageSize: {
                fallbackValue: 10,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
            },
          },
          ({ set, reset }) => ({ set, reset })
        )
      ),
      craftQueryParam('filter', () =>
        queryParam({
          state: {
            active: {
              fallbackValue: false,
              parse: (value: string) => value === 'true',
              serialize: (value: unknown) => String(value),
            },
          },
        })
      ),
      craftSetAllQueriesParamsStandalone()
    );

    TestBed.runInInjectionContext(() => {
      const store = injectTestStoreCraft();

      expect(store.paginationPage()).toBe(1);
      expect(store.paginationPageSize()).toBe(10);
      expect(store.pagination()).toEqual({
        page: 1,
        pageSize: 10,
      });
      expectTypeOf(store.pagination()).toEqualTypeOf<{
        page: number;
        pageSize: number;
      }>();
      store.setPagination({ page: 2, pageSize: 20 });
      expect(store.pagination()).toEqual({
        page: 2,
        pageSize: 20,
      });
      store.resetPagination();
      expect(store.pagination()).toEqual({
        page: 1,
        pageSize: 10,
      });

      expectTypeOf<
        Prettify<Parameters<typeof setAllTestStoreQueryParams>[0]>
      >().toEqualTypeOf<{
        pagination: {
          page: number;
          pageSize: number;
        };
        filter: {
          active: boolean;
        };
      }>();
      const queryParamsForUrl = setAllTestStoreQueryParams({
        pagination: {
          page: 3,
          pageSize: 30,
        },
        filter: {
          active: true,
        },
      });
      //todoR fix
      expectTypeOf(queryParamsForUrl).toEqualTypeOf<{
        page: string;
        pageSize: string;
        active: string;
      }>();
      expect(queryParamsForUrl).toEqual({
        page: '3',
        pageSize: '30',
        active: 'true',
      });
    });
  });

  it('should navigate to the target URL with specified query params using router.navigate', async () => {
    const harness = await RouterTestingHarness.create('');
    const { injectTestStoreCraft, setAllTestStoreQueryParams } = craft(
      {
        providedIn: 'root',
        name: 'TestStore',
      },
      craftQueryParam('pagination', () =>
        queryParam({
          state: {
            page: {
              fallbackValue: 1,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
            pageSize: {
              fallbackValue: 10,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
          },
        })
      ),
      craftQueryParam('filter', () =>
        queryParam({
          state: {
            active: {
              fallbackValue: false,
              parse: (value: string) => value === 'true',
              serialize: (value: unknown) => String(value),
            },
          },
        })
      ),
      craftSetAllQueriesParamsStandalone()
    );

    await TestBed.runInInjectionContext(async () => {
      const router = inject(Router);
      const location = inject(Location);

      await router.navigate(['test'], {
        queryParams: setAllTestStoreQueryParams({
          pagination: { page: 4, pageSize: 20 },
          filter: { active: true },
        }),
      });

      expect(location.path()).toEqual('/test?page=4&pageSize=20&active=true');
    });

    await TestBed.runInInjectionContext(() => {
      const store = injectTestStoreCraft();

      expect(store.pagination()).toEqual({
        page: 4,
        pageSize: 20,
      });
      expect(store.filter()).toEqual({
        active: true,
      });
    });
  });

  it('should navigateByUrl to the target URL with specified query params', async () => {
    const harness = await RouterTestingHarness.create();
    const { injectTestStoreCraft, setAllTestStoreQueryParams } = craft(
      {
        providedIn: 'root',
        name: 'TestStore',
      },
      craftQueryParam('pagination', () =>
        queryParam({
          state: {
            page: {
              fallbackValue: 1,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
            pageSize: {
              fallbackValue: 10,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
          },
        })
      ),
      craftQueryParam('filter', () =>
        queryParam({
          state: {
            active: {
              fallbackValue: false,
              parse: (value: string) => value === 'true',
              serialize: (value: unknown) => String(value),
            },
          },
        })
      ),
      craftSetAllQueriesParamsStandalone()
    );

    await TestBed.runInInjectionContext(async () => {
      const router = inject(Router);

      await router.navigateByUrl(
        `/test?${setAllTestStoreQueryParams({
          pagination: { page: 5, pageSize: 25 },
          filter: { active: false },
        })}`
      );
    });

    await TestBed.runInInjectionContext(() => {
      const store = injectTestStoreCraft();
      const location = inject(Location);

      expect(store.pagination()).toEqual({
        page: 5,
        pageSize: 25,
      });
      expect(store.filter()).toEqual({
        active: false,
      });
      expect(location.path()).toEqual('/test?page=5&pageSize=25&active=false');
    });
  });
});
