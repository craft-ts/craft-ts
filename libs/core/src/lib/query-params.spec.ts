import { TestBed } from '@angular/core/testing';
import { queryParams } from './query-params';
import { provideRouter, Router } from '@angular/router';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { craftService } from './craft-service';
import type { ExtractDeps } from './branded-component/branded-component';
import type { GetServiceDependencies } from './craft-service';
import {
  provideFnWrapObserver,
  provideFnWrapper,
  type FnWrapper,
} from './fn-wrapper';
import {
  injectQueryParamsMethodRuntimeContext,
  type QueryParamsMethodRuntimeContext,
} from './primitive-method-runtime-context';
import {
  providePrimitiveResourceRuntimeObserver,
  type PrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';
import { craftUse } from './craft-use';

let queryParamsResourceObserver:
  | ((context: PrimitiveResourceRuntimeContext) => void)
  | undefined;
let queryParamsWrapObserver: (() => void) | undefined;
let queryParamsRuntimeContextObserver:
  | ((context: QueryParamsMethodRuntimeContext) => void)
  | undefined;

const queryParamsRuntimeContextWrapper: FnWrapper = function* (
  factory,
  thisArg,
  args,
) {
  const context = injectQueryParamsMethodRuntimeContext();
  if (context !== undefined) {
    queryParamsRuntimeContextObserver?.(context);
  }
  return yield* factory.apply(thisArg, args);
};

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

describe('queryParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryParamsResourceObserver = undefined;
    queryParamsWrapObserver = undefined;
    queryParamsRuntimeContextObserver = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        providePrimitiveResourceRuntimeObserver((context) => {
          queryParamsResourceObserver?.(context);
        }),
        provideFnWrapObserver(() => {
          queryParamsWrapObserver?.();
        }),
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          queryParamsRuntimeContextWrapper,
        ),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a query params', () => {
    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams('myQueryParams', {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: (value: string) => parseInt(value, 10),
                encode: (value: unknown) => String(value),
              },
            },
            pageSize: {
              fallbackValue: 10,
              codec: {
                decode: (value: string) => parseInt(value, 10),
                encode: (value: unknown) => String(value),
              },
            },
          },
        }),
      );
      expect(myQueryParams).toBeDefined();
    });
  });

  it('should create a query params and can expose state and basic methods (set, update, patch)', () => {
    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
            },
          },
          ({ set, update, patch }) => ({ set, update, patch }),
        ),
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

  it('exposes the queryParams resource context to runtime observers', () => {
    let resourceContext: PrimitiveResourceRuntimeContext | undefined;
    queryParamsResourceObserver = (context) => {
      resourceContext = context;
    };

    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams('myQueryParams', {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: (value: string) => parseInt(value, 10),
                encode: (value: unknown) => String(value),
              },
            },
            pageSize: {
              fallbackValue: 10,
              codec: {
                decode: (value: string) => parseInt(value, 10),
                encode: (value: unknown) => String(value),
              },
            },
          },
        }),
      );

      expect(resourceContext?.kind).toBe('queryParams');
      expect(resourceContext?.grouped).toBe(false);
      resourceContext?.set({ page: 2, pageSize: 20 });
      expect(myQueryParams()).toEqual({ page: 2, pageSize: 20 });
      resourceContext?.update((current) => ({
        ...(current as object),
        page: 3,
      }));
      expect(myQueryParams.page()).toBe(3);
      resourceContext?.patch(() => ({ pageSize: 30 }));
      expect(myQueryParams.pageSize()).toBe(30);
    });
  });

  it('exposes the queryParams runtime context to insertion method wrappers', () => {
    let observedContext: QueryParamsMethodRuntimeContext | undefined;
    let runtimeContext: QueryParamsMethodRuntimeContext | undefined;
    queryParamsWrapObserver = () => {
      observedContext =
        injectQueryParamsMethodRuntimeContext() ?? observedContext;
    };
    queryParamsRuntimeContextObserver = (context) => {
      runtimeContext = context;
    };

    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
            },
          },
          ({ patch }) => ({
            nextPage: () => patch((current) => ({ page: current.page + 1 })),
          }),
        ),
      );

      expect(observedContext?.kind).toBe('queryParams');
      myQueryParams.nextPage();
      expect(runtimeContext?.kind).toBe('queryParams');
      expect(runtimeContext?.get()).toEqual({ page: 2 });
      runtimeContext?.patch(() => ({ page: 10 }));
      expect(myQueryParams.page()).toBe(10);
    });
  });

  it('typing: tracks dependencies used by generator insertions', () => {
    const { PaginationRulesDeps } = craftService(
      { name: 'PaginationRulesDeps', scope: 'global' },
      () => ({
        maxPage: () => 3,
      }),
    );

    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: number) => String(value),
                },
              },
            },
          },
          function* ({ patch, state }) {
            const rules = yield* PaginationRulesDeps();

            return {
              nextPage: () => {
                if (state().page >= rules.maxPage()) {
                  return;
                }

                patch(({ page }) => ({
                  page: page + 1,
                }));
              },
            };
          },
        ),
      );

      expectTypeOf<ExtractDeps<typeof myQueryParams>>().toEqualTypeOf<{
        Router: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
        PaginationRulesDeps: GetServiceDependencies<typeof PaginationRulesDeps>;
      }>();
    });
  });

  it('should create a query params and  basic methods (set, update, patch) should not be exposed implicitly', () => {
    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams('myQueryParams', {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: (value: string) => parseInt(value, 10),
                encode: (value: unknown) => String(value),
              },
            },
            pageSize: {
              fallbackValue: 10,
              codec: {
                decode: (value: string) => parseInt(value, 10),
                encode: (value: unknown) => String(value),
              },
            },
          },
        }),
      );

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
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
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
        ),
      );
    });
  });

  it('should expose basic methods in insertions', () => {
    TestBed.runInInjectionContext(() => {
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
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
        ),
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
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
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
        ),
      );
    });
  });

  it('should not expose methods bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = signalSource<number>('mySource');
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
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
        ),
      );
      //@ts-expect-error _setPage is bind to a source, so it should not be exposed
      expectTypeOf(myQueryParams._setPage).toEqualTypeOf<never>();
    });
  });

  it('should remove query params from URL when reset to fallback values', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const { myQueryParams } = craftUse(
        queryParams(
          'myQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: unknown) => String(value),
                },
              },
            },
          },
          ({ set, reset }) => ({ set, reset }),
        ),
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

describe('queryParams codecs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('decodes and encodes values through a synchronous codec', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const { filters } = craftUse(
        queryParams(
          'filters',
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
          ({ set }) => ({ set }),
        ),
      );

      expectTypeOf(filters.page()).toEqualTypeOf<number>();

      await router.navigate([], { queryParams: { page: '4' } });
      expect(filters.page()).toBe(4);

      filters.set({ page: 5 });
      await vi.runAllTimersAsync();
      expect(router.url).toContain('page=5');
    });
  });

  it('falls back and exposes native codec decode errors', async () => {
    const nativeError = new Error('invalid page');

    await TestBed.runInInjectionContext(async () => {
      const router = TestBed.inject(Router);
      const { filters } = craftUse(
        queryParams('filters', {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: () => {
                  throw nativeError;
                },
                encode: (value: number) => String(value),
              },
            },
          },
        }),
      );

      await router.navigate([], { queryParams: { page: 'invalid' } });

      expect(filters.page()).toBe(1);
      expect(filters.exceptions().parse.page?.code).toBe(
        'QueryParamDecodeError',
      );
      expect(filters.exceptions().parse.page?.payload).toEqual({
        key: 'page',
        value: 'invalid',
        error: nativeError,
      });
    });
  });

  it('throws a QueryParamEncodeError before navigation', () => {
    TestBed.runInInjectionContext(() => {
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate');
      const { filters } = craftUse(
        queryParams(
          'filters',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => Number(value),
                  encode: () => {
                    throw new Error('cannot encode');
                  },
                },
              },
            },
          },
          ({ set }) => ({ set }),
        ),
      );

      expect(() => filters.set({ page: 2 })).toThrowError();
      expect(navigate).not.toHaveBeenCalled();
      expect(filters.page()).toBe(1);
    });
  });
});
