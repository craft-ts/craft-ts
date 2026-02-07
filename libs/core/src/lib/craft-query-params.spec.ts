import { craft } from './craft';
import { queryParam, QueryParamNavigationOptions } from './query-param';
import { TestBed } from '@angular/core/testing';
import { craftQueryParams } from './craft-query-params';
import { provideRouter } from '@angular/router';

describe('craftQueryParams', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });
  it('should create craft query params with correct types and methods', () => {
    const { injectMyStoreCraft } = craft(
      {
        name: 'MyStore',
        providedIn: 'root',
      },
      craftQueryParams(() => ({
        pagination: queryParam(
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
          ({ set, reset }) => ({ set, reset }),
        ),
        active: queryParam(
          {
            state: {
              isActive: {
                fallbackValue: false,
                parse: (value: string) => value === 'true',
                serialize: (value: unknown) => String(value),
              },
            },
          },
          ({ set }) => ({ set }),
        ),
      })),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectMyStoreCraft();

      expectTypeOf(store.pagination()).toEqualTypeOf<{
        page: number;
        pageSize: number;
      }>();

      expect(store.pagination()).toEqual({
        page: 1,
        pageSize: 10,
      });

      expectTypeOf(store.setPagination).toEqualTypeOf<
        (
          params: {
            page: number;
            pageSize: number;
          },
          options?: QueryParamNavigationOptions | undefined,
        ) => {
          page: number;
          pageSize: number;
        }
      >();
      store.setPagination({ page: 2, pageSize: 20 });
      expect(store.pagination()).toEqual({
        page: 2,
        pageSize: 20,
      });

      expectTypeOf(store.resetPagination).toEqualTypeOf<
        (options?: QueryParamNavigationOptions | undefined) => void
      >();
      store.resetPagination();
      expect(store.pagination()).toEqual({
        page: 1,
        pageSize: 10,
      });

      expectTypeOf(store.active()).toEqualTypeOf<{
        isActive: boolean;
      }>();
      expect(store.active().isActive).toBe(false);

      store.setActive({ isActive: true });
      expect(store.active().isActive).toBe(true);
    });
  });

  it('should create craft query params and expose setXQueryParam (that can be used with the routing)', () => {
    const { setActiveQueryParam, setPaginationQueryParam } = craft(
      {
        name: 'MyStore',
        providedIn: 'root',
      },
      craftQueryParams(() => ({
        pagination: queryParam(
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
          ({ set, reset }) => ({ set, reset }),
        ),
        active: queryParam(
          {
            state: {
              isActive: {
                fallbackValue: false,
                parse: (value: string) => value === 'true',
                serialize: (value: unknown) => String(value),
              },
            },
          },
          ({ set }) => ({ set }),
        ),
      })),
    );

    const paginationQp = setPaginationQueryParam({ page: 3, pageSize: 30 });
    expectTypeOf(paginationQp).toEqualTypeOf<{
      page: string;
      pageSize: string;
    }>();
    console.log('paginationQp test', paginationQp);
    expect(paginationQp).toEqual({ page: '3', pageSize: '30' });
    expect(`${setPaginationQueryParam({ page: 4, pageSize: 40 })}`).toBe(
      'page=4&pageSize=40',
    );
    const activeQp = setActiveQueryParam({ isActive: true });
    expectTypeOf(activeQp).toEqualTypeOf<{ isActive: string }>();
    expect(activeQp).toEqual({ isActive: 'true' });
    expect(`${setActiveQueryParam({ isActive: false })}`).toBe(
      'isActive=false',
    );
  });
});
