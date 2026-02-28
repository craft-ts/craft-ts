import { TestBed } from '@angular/core/testing';
import { queryParam } from './query-param';
import { provideRouter, Router } from '@angular/router';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { craftException, CraftExceptionResult } from './craft-exception';

describe('queryParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a query params', () => {
    TestBed.runInInjectionContext(() => {
      const myQueryParams = queryParam({
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
      });
      expect(myQueryParams).toBeDefined();
    });
  });

  it('should create a query params and can expose state and basic methods (set, update, patch)', () => {
    TestBed.runInInjectionContext(() => {
      const myQueryParams = queryParam(
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
        ({ set, update, patch }) => ({ set, update, patch }),
      );
      expectTypeOf(myQueryParams()).toEqualTypeOf<{
        page: number;
        pageSize: number;
      }>();

      expect(myQueryParams()).toEqual({
        page: 1,
        pageSize: 10,
      });

      expect(myQueryParams.page()).toBe(1);
      expect(myQueryParams.pageSize()).toBe(10);
      console.log('myQueryParams', myQueryParams);
      myQueryParams.set({
        page: 2,
        pageSize: 20,
      });
      expect(myQueryParams.page()).toBe(2);
      expect(myQueryParams.pageSize()).toBe(20);

      myQueryParams.update((current) => ({
        ...current,
        page: current.page + 1,
      }));
      expect(myQueryParams.page()).toBe(3);

      myQueryParams.patch({
        pageSize: 50,
      });
      expect(myQueryParams.pageSize()).toBe(50);
    });
  });

  it('should create a query params and  basic methods (set, update, patch) should not be exposed implicitly', () => {
    TestBed.runInInjectionContext(() => {
      const myQueryParams = queryParam({
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
      });

      type t = keyof typeof myQueryParams;

      expectTypeOf<
        Extract<keyof typeof myQueryParams, 'set'>
      >().toEqualTypeOf<never>();
      //@ts-expect-error set should not be exposed implicitly
      expect(myQueryParams.set).toBeUndefined();
    });
  });

  it('should create a query params and methods', () => {
    TestBed.runInInjectionContext(() => {
      const myQueryParams = queryParam(
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
        ({ state, set }) => ({
          goTo: (newPage: number) => {
            expectTypeOf(state()).toEqualTypeOf<{
              page: number;
              pageSize: number;
            }>();
            set({
              ...state(),
              page: newPage,
            });
          },
        }),
      );
    });
  });

  it('should expose basic methods in insertions', () => {
    TestBed.runInInjectionContext(() => {
      const myQueryParams = queryParam(
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
        ({ state, set, update, patch, reset, config }) => {
          expect(update).toBeDefined();
          expect(patch).toBeDefined();
          expect(reset).toBeDefined();
          expect(config).toBeDefined();
          return {
            _setPage: (newPage: number) => {
              expectTypeOf(state()).toEqualTypeOf<{
                page: number;
                pageSize: number;
              }>();
              set({
                ...state(),
                page: newPage,
              });
            },
            _updatePage: (inc: number) => {
              update((current) => ({
                ...current,
                page: current.page + inc,
              }));
            },
            _patchPageSize: (newPageSize: number) => {
              patch({
                pageSize: newPageSize,
              });
            },
            _reset: () => {
              reset();
            },
          };
        },
      );
      myQueryParams._setPage(2);
      expect(myQueryParams.page()).toBe(2);
      myQueryParams._updatePage(3);
      expect(myQueryParams.page()).toBe(5);
      myQueryParams._patchPageSize(100);
      expect(myQueryParams.pageSize()).toBe(100);
      myQueryParams._reset();
      expect(myQueryParams()).toEqual({
        page: 1,
        pageSize: 10,
      });
    });
  });

  it('should accept options and not loosing insertions inference', () => {
    TestBed.runInInjectionContext(() => {
      const myQueryParams = queryParam(
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
          queryParamsHandling: 'merge',
          onSameUrlNavigation: 'reload',
          replaceUrl: true,
          skipLocationChange: false,
        },
        ({ state, set, update, patch, reset, config }) => {
          expect(update).toBeDefined();
          expect(patch).toBeDefined();
          expect(reset).toBeDefined();
          expect(config).toBeDefined();
          return {
            _set: (newPage: number) => {
              expectTypeOf(state()).toEqualTypeOf<{
                page: number;
                pageSize: number;
              }>();
              set({
                ...state(),
                page: newPage,
              });
            },
            _update: (inc: number) => {
              update((current) => ({
                ...current,
                page: current.page + inc,
              }));
            },
            _patch: (newPageSize: number) => {
              patch({
                pageSize: newPageSize,
              });
            },
            _reset: () => {
              reset();
            },
          };
        },
      );
    });
  });

  it('should not expose methods bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = signalSource<number>();
      const myQueryParams = queryParam(
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
        ({ state, set }) => {
          return {
            _setPage: afterRecomputation(mySource, (newPage: number) => {
              expectTypeOf(state()).toEqualTypeOf<{
                page: number;
                pageSize: number;
              }>();
              set({
                ...state(),
                page: newPage,
              });
            }),
          };
        },
      );
      //@ts-expect-error _setPage is bind to a source, so it should not be exposed
      expectTypeOf(myQueryParams._setPage).toEqualTypeOf<never>();
    });
  });

  it('should remove query params from URL when reset to fallback values', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const myQueryParams = queryParam(
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
      );

      // Set non-fallback values
      myQueryParams.set({
        page: 5,
        pageSize: 50,
      });

      // Wait for navigation to complete
      await vi.runAllTimersAsync();

      // Verify params are in URL
      expect(router.url).toContain('page=5');
      expect(router.url).toContain('pageSize=50');

      // Reset to fallback values
      myQueryParams.reset();

      // Wait for navigation to complete
      await vi.runAllTimersAsync();

      // Verify params are removed from URL (no query params)
      expect(router.url).not.toContain('page=');
      expect(router.url).not.toContain('pageSize=');
      expect(router.url).not.toContain('?');

      // But state should still have fallback values
      expect(myQueryParams.page()).toBe(1);
      expect(myQueryParams.pageSize()).toBe(10);
    });
  });
});

describe('queryParam exceptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('typing: captures parse exception', () => {
    TestBed.runInInjectionContext(() => {
      const queryParams = queryParam({
        state: {
          page: {
            fallbackValue: 1,
            parse: (value) =>
              value === 'invalid'
                ? craftException(
                    { code: 'INVALID_PAGE' },
                    { reason: 'NaN' as const },
                  )
                : parseInt(value, 10),
            serialize: (value) => String(value),
          },
        },
      });

      expectTypeOf(queryParams.page()).toEqualTypeOf<number>();
      expectTypeOf(queryParams.exceptions().list).toEqualTypeOf<
        CraftExceptionResult<
          {
            code: 'INVALID_PAGE';
            scope: 'parse';
            identifier: 'page';
          },
          {
            reason: 'NaN';
          }
        >[]
      >();
      expectTypeOf(queryParams.exceptions().parse.page).toEqualTypeOf<
        | CraftExceptionResult<
            {
              code: 'INVALID_PAGE';
              scope: 'parse';
              identifier: 'page';
            },
            {
              reason: 'NaN';
            }
          >
        | undefined
      >();
    });
  });

  it('typing: exposes exceptions in insertions context', () => {
    TestBed.runInInjectionContext(() => {
      queryParam(
        {
          state: {
            page: {
              fallbackValue: 1,
              parse: (value) =>
                value === 'invalid'
                  ? craftException(
                      { code: 'INVALID_PAGE' },
                      { reason: 'NaN' as const },
                    )
                  : parseInt(value, 10),
              serialize: (value) => String(value),
            },
          },
        },
        ({ exceptions, hasException }) => {
          expectTypeOf(hasException()).toEqualTypeOf<boolean>();
          expectTypeOf(exceptions().list).toEqualTypeOf<
            CraftExceptionResult<
              {
                code: 'INVALID_PAGE';
                scope: 'parse';
                identifier: 'page';
              },
              {
                reason: 'NaN';
              }
            >[]
          >();
          expectTypeOf(exceptions().parse.page).toEqualTypeOf<
            | CraftExceptionResult<
                {
                  code: 'INVALID_PAGE';
                  scope: 'parse';
                  identifier: 'page';
                },
                {
                  reason: 'NaN';
                }
              >
            | undefined
          >();
          return {};
        },
      );
    });
  });

  it('captures parse exception returned by parse function', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const queryParams = queryParam({
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) =>
              value === 'invalid'
                ? craftException(
                    { code: 'INVALID_PAGE' },
                    { reason: 'NaN' as const },
                  )
                : parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
        },
      });

      await router.navigate([], { queryParams: { page: 'invalid' } });
      await vi.runAllTimersAsync();

      expect(queryParams.page()).toBe(1);
      expect(queryParams.hasException()).toBe(true);
      expect(queryParams.exceptions().parse.page?.INVALID_PAGE).toEqual({
        reason: 'NaN',
      });
    });
  });

  it('captures parse exception thrown by parse function', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const queryParams = queryParam({
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => {
              if (value === 'invalid') {
                return craftException(
                  { code: 'INVALID_PAGE' },
                  { reason: 'throw' as const },
                );
              }
              return parseInt(value, 10);
            },
            serialize: (value: unknown) => String(value),
          },
        },
      });

      await router.navigate([], { queryParams: { page: 'invalid' } });
      await vi.runAllTimersAsync();

      expect(queryParams.page()).toBe(1);
      expect(queryParams.hasException()).toBe(true);
      expect(queryParams.exceptions().parse.page?.INVALID_PAGE).toEqual({
        reason: 'throw',
      });
    });
  });

  it('does not expose non-craft parse errors in exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const queryParams = queryParam({
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => {
              if (value === 'invalid') {
                throw new Error('Non-craft error');
              }
              return parseInt(value, 10);
            },
            serialize: (value: unknown) => String(value),
          },
        },
      });

      await router.navigate([], { queryParams: { page: 'invalid' } });
      await vi.runAllTimersAsync();

      expect(queryParams.page()).toBe(1);
      expect(queryParams.hasException()).toBe(false);
      expect(queryParams.exceptions().parse).toEqual({});
    });
  });
});
