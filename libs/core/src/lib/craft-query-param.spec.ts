import { TestBed } from '@angular/core/testing';
import { Component, inject } from '@angular/core';
import { craft } from './craft';
import { craftQueryParam } from './craft-query-param';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Location } from '@angular/common';
import { craftSources } from './craft-sources';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { queryParam } from './query-param';

@Component({
  template: '',
  standalone: true,
})
class TestComponent {
  route = inject(ActivatedRoute);
}

describe('craftQueryParam', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '', component: TestComponent }])],
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create query params configuration', () => {
    const { injectCraft } = craft(
      {
        providedIn: 'root',
        name: '',
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
          ({ set, reset }) => ({ set, reset }),
        ),
      ),
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();

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
    });
  });

  it('should use default values when query params are missing', () => {
    const { injectCraft } = craft(
      {
        providedIn: 'root',
        name: '',
      },
      craftQueryParam('pagination', () =>
        queryParam({
          state: {
            page: {
              fallbackValue: 1,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
            active: {
              fallbackValue: false,
              parse: (value: string) => value === 'true',
              serialize: (value: unknown) => String(value),
            },
          },
        }),
      ),
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();

      expect(store.paginationPage()).toBe(1);
      expect(store.paginationActive()).toBe(false);
    });
  });

  it('should accept custom methods configuration', () => {
    const { injectCraft } = craft(
      {
        providedIn: 'root',
        name: '',
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
            },
          },
          ({ state, set }) => ({
            set,
            customMethod: (newPage: number) => {
              expectTypeOf(state()).toEqualTypeOf<{ page: number }>();
              expect(state().page).toBe(2);
              set({
                ...state(),
                page: newPage,
              });
              return state();
            },
          }),
        ),
      ),
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();

      expect(typeof store['customMethodPagination']).toBe('function');
      expectTypeOf(store.pagination()).toEqualTypeOf<{ page: number }>();
      expect(store.pagination().page).toBe(1);
      expectTypeOf(store.paginationPage()).toEqualTypeOf<number>();
      expect(store.paginationPage()).toBe(1);
      store.setPagination({ page: 2 });
      expect(store.paginationPage()).toBe(2);
      expectTypeOf(store.customMethodPagination).toEqualTypeOf<
        (newPage: number) => { page: number }
      >();
      store.customMethodPagination(3);

      expect(store.paginationPage()).toBe(3);
    });
  });

  it('should accept custom methods that rely on source', async () => {
    const { injectCraft } = craft(
      {
        providedIn: 'root',
        name: '',
      },
      craftSources({
        nextPage: signalSource<{}>(),
      }),
      craftQueryParam('pagination', ({ nextPage }) =>
        queryParam(
          {
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
            },
          },
          ({ set, state }) => {
            return {
              set,
              nextPage: afterRecomputation(nextPage, (nextPage) => {
                expectTypeOf(nextPage).toEqualTypeOf<{}>();
                expectTypeOf(state()).toEqualTypeOf<{ page: number }>();
                expect(state().page).toBe(2);
                set({
                  ...state(),
                  page: state().page + 1,
                });
              }),
            };
          },
        ),
      ),
    );
    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expectTypeOf(store.pagination()).toEqualTypeOf<{ page: number }>();
      expect(store.pagination().page).toBe(1);
      expectTypeOf(store.paginationPage()).toEqualTypeOf<number>();
      expect(store.paginationPage()).toBe(1);
      store.setPagination({ page: 2 });
      expect(store.paginationPage()).toBe(2);
      //@ts-expect-error nextPage is not exposed
      expectTypeOf(store.nextPage).toEqualTypeOf<any>();
      store.setNextPage({});
      await vi.runAllTimersAsync();
      expect(store.paginationPage()).toBe(3);
    });
  });
});

const { injectCraft } = craft(
  {
    providedIn: 'root',
    name: '',
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
      ({ set }) => ({ set }),
    ),
  ),
);

describe('craftQueryParam integration', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'test', component: TestComponent }])],
    });
  });
  it('should retrieve query params from the URL', async () => {
    const harness = await RouterTestingHarness.create();
    const instance = await harness.navigateByUrl(
      '/test?page=2&pageSize=5',
      TestComponent,
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();

      expect(store.pagination()).toEqual({
        page: 2,
        pageSize: 5,
      });
    });
  });

  it('should update query param values when the query param in the URL change ', async () => {
    const harness = await RouterTestingHarness.create();
    const instance = await harness.navigateByUrl(
      '/test?page=2&pageSize=5',
      TestComponent,
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();

      expect(store.pagination()).toEqual({
        page: 2,
        pageSize: 5,
      });

      await harness.navigateByUrl('/test?page=5&pageSize=5', TestComponent);

      expect(store.pagination()).toEqual({
        page: 5,
        pageSize: 5,
      });
    });
  });

  it('should update query params in the URL after a manual change', async () => {
    // Création du harness et navigation initiale
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/test', TestComponent);

    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();

      expect(store.pagination()).toEqual({
        page: 1,
        pageSize: 10,
      });

      store.setPagination({ page: 3, pageSize: 15 });
    });
    await harness.fixture.whenStable();

    await TestBed.runInInjectionContext(async () => {
      const location = inject(Location);
      // Assertions
      expect(location.path()).toContain('page=3');
      expect(location.path()).toContain('pageSize=15');
    });
  });
});

describe('craftQueryParam standalone methods', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'test', component: TestComponent }])],
    });
  });
  it('should navigate to the target URL with specified query params', async () => {
    const harness = await RouterTestingHarness.create('');
    const { injectCraft, setPaginationQueryParams } = craft(
      {
        providedIn: 'root',
        name: '',
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
        }),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const router = inject(Router);
      const location = inject(Location);

      await router.navigate(['test'], {
        queryParams: setPaginationQueryParams({ page: 4, pageSize: 20 }),
      });

      expect(location.path()).toEqual('/test?page=4&pageSize=20');
    });
    await TestBed.runInInjectionContext(() => {
      const loation = inject(Location);
      const store = injectCraft();

      expect(store.pagination()).toEqual({
        page: 4,
        pageSize: 20,
      });
    });
  });
  it('should navigateByUrl to the target URL with specified query params', async () => {
    const harness = await RouterTestingHarness.create();
    const { injectCraft, setPaginationQueryParams } = craft(
      {
        providedIn: 'root',
        name: '',
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
        }),
      ),
    );
    await TestBed.runInInjectionContext(async () => {
      const router = inject(Router);

      await router.navigateByUrl(
        `/test?${setPaginationQueryParams({
          page: 4,
          pageSize: 20,
        })}`,
      );

      console.log(
        'navigated',
        `${setPaginationQueryParams({
          page: 4,
          pageSize: 20,
        })}`,
      );
    });
    await TestBed.runInInjectionContext(() => {
      const store = injectCraft();

      expect(store.pagination()).toEqual({
        page: 4,
        pageSize: 20,
      });

      const location = inject(Location);
      expect(location.path()).toEqual('/test?page=4&pageSize=20');
    });
  });
});
