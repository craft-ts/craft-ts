import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  inject,
  Injector,
  isSignal,
  linkedSignal,
  runInInjectionContext,
  Signal,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  InsertionsQueryParamsFactory,
  InsertionQueryParamsFactoryContext,
} from './query.core';
import { MergeObjects } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { Prettify } from './util/util.type';
import { ActivatedRoute, Router } from '@angular/router';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import {
  AnyCraftException,
  ExtractCraftException,
  InsertMetaInCraftExceptionIfExists,
  StripCraftException,
  isCraftException,
} from './craft-exception';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
  ServiceTrackingMetadata,
  ServiceYieldRequest,
} from './craft-service';
import {
  APP_SNAPSHOT_REGISTRY,
  INSERTION_SNAPSHOT_REGISTRY,
  InsertionSnapshotRegistry,
  triggerAndCollectInsertions,
} from './take-app-snapshot';
import { ɵprovidePrimitiveMethodRuntimeContext } from './primitive-method-runtime-context';
import {
  ɵcreatePrimitiveResourceRuntimeContext,
  ɵobservePrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';

export interface QueryParamNavigationOptions {
  queryParamsHandling?: 'merge' | 'preserve' | '';
  onSameUrlNavigation?: 'reload' | 'ignore';
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
}

type ResolveGeneratorResult<Result> = Result extends Generator<
  any,
  infer Output,
  unknown
>
  ? Output
  : Result;

type ResolveFactoryResult<Factory> = Factory extends (...args: any[]) => infer Result
  ? ResolveGeneratorResult<Result>
  : never;

type ExtractFactoryYielded<Factory> = Factory extends (
  ...args: any[]
) => Generator<infer Yielded, any, unknown>
  ? Yielded
  : never;

type QueryParamConfigYielded<Config> = Config extends {
  parse: infer Parse;
  serialize: infer Serialize;
}
  ? ExtractFactoryYielded<Parse> | ExtractFactoryYielded<Serialize>
  : never;

type QueryParamsConfigYielded<QueryParamsType> = {
  [K in keyof QueryParamsType]: QueryParamConfigYielded<QueryParamsType[K]>;
}[keyof QueryParamsType];

type RouterQueryParamYield = ServiceYieldRequest<
  'global',
  Router,
  ServiceTrackingMetadata<'Router', 'global', Router, never, undefined, never, false>
>;

type QueryParamTrackedDependencies<
  QueryParamsType,
  InsertionsYielded = never,
> = ServiceDependencyMapFromYielded<
  RouterQueryParamYield | QueryParamsConfigYielded<QueryParamsType> | InsertionsYielded
>;

type AnyQueryParamConfig = QueryParamConfig<any>;

export type QueryParamsToState<QueryParamConfigs> = {
  [K in keyof QueryParamConfigs]: 'parse' extends keyof QueryParamConfigs[K]
    ? QueryParamConfigs[K]['parse'] extends (...args: any[]) => unknown
      ? StripCraftException<ResolveFactoryResult<QueryParamConfigs[K]['parse']>>
      : 'Error1: QueryParamsToState'
    : 'Error2: QueryParamsToState';
};

type QueryParamParseExceptionsByKey<QueryParamsType> =
  QueryParamsType extends Record<string, AnyQueryParamConfig>
    ? {
        [K in keyof QueryParamsType]: InsertMetaInCraftExceptionIfExists<
          ExtractCraftException<ResolveFactoryResult<QueryParamsType[K]['parse']>>,
          'parse',
          K & string
        >;
      }
    : Record<string, never>;

type QueryParamParseExceptionUnion<QueryParamsType> =
  QueryParamParseExceptionsByKey<QueryParamsType>[keyof QueryParamParseExceptionsByKey<QueryParamsType>];

export type QueryParamExceptions<QueryParamsType> = {
  list: QueryParamParseExceptionUnion<QueryParamsType>[];
  parse: Partial<QueryParamParseExceptionsByKey<QueryParamsType>>;
};

export type QueryParamOutput<
  QueryParamsType,
  Insertions,
  QueryParamsState,
  Dependencies = QueryParamTrackedDependencies<QueryParamsType>,
> =
  Signal<QueryParamsState> &
    MergeObjects<
      [
        {
          [K in keyof QueryParamsState]: Signal<QueryParamsState[K]>;
        },
        IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>,
        {
          hasException: Signal<boolean>;
          exceptions: Signal<QueryParamExceptions<QueryParamsType>>;
        },
        {
          _config: QueryParamsType;
          readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
        },
      ]
    >;

function enrichQueryParamParseException(
  exception: AnyCraftException,
  key: string,
): AnyCraftException {
  return {
    ...exception,
    scope: 'parse',
    identifier: key,
    [exception.code]: exception.payload,
  };
}

const QUERY_PARAM_INVALID_YIELD_ERROR_MESSAGE =
  'queryParam generators can only yield craftService dependencies or exposed dependency helpers.';
const QUERY_PARAM_APP_START_ERROR_MESSAGE =
  'queryParam generators do not support onAppStart(...).';

function executeQueryParamFactory<This, Args extends unknown[], Result>(
  injector: Injector,
  factory: (this: This, ...args: Args) => Result,
  thisArg: This,
  ...args: Args
): ResolveGeneratorResult<Result> {
  return runInInjectionContext(injector, () => {
    const result = factory.apply(thisArg, args);

    if (!isGenerator(result)) {
      return result as ResolveGeneratorResult<Result>;
    }

    return runCraftGenerator({
      iterator: result,
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: QUERY_PARAM_INVALID_YIELD_ERROR_MESSAGE,
      multipleAppStartErrorMessage: QUERY_PARAM_APP_START_ERROR_MESSAGE,
      onAppStartNotSupportedErrorMessage: QUERY_PARAM_APP_START_ERROR_MESSAGE,
    }).value as ResolveGeneratorResult<Result>;
  });
}

export type QueryParamParser<T = unknown> = (
  value: string,
) => T | Generator<unknown, T, unknown>;

export type QueryParamSerializer<T = unknown> = (
  value: NoInfer<T>,
) => string | Generator<unknown, string, unknown>;

export interface QueryParamConfig<
  T = unknown,
  Parse extends QueryParamParser<T> = QueryParamParser<T>,
  Serialize extends QueryParamSerializer<T> = QueryParamSerializer<T>,
> {
  parse: Parse;
  fallbackValue: NoInfer<T>;
  serialize: Serialize;
}

/**
 * Creates a reactive query parameter manager that synchronizes state with URL query parameters.
 *
 * This function manages query parameter state by:
 * - Reading initial values from the URL or using default values
 * - Parsing URL strings into typed values using the provided `parse` function
 * - Serializing typed values back to strings for URL updates using the `serialize` function
 * - Providing reactive signals for each query parameter
 *
 * @remarks
 * **Important:** This function must be called within an injection context.
 * If called outside an injection context, it will only return an object containing the configuration under `_config`.
 *
 * @param config - Configuration object containing:
 *   - `state`: Record of query parameter configurations, each with `fallbackValue`, `parse`, and `serialize`
 *   - `queryParamsHandling` (optional): How to handle existing query params ('merge' | 'preserve' | '')
 *   - `onSameUrlNavigation` (optional): Behavior on same URL navigation ('reload' | 'ignore')
 *   - `replaceUrl` (optional): Whether to replace the URL in browser history
 *   - `skipLocationChange` (optional): Whether to skip updating the browser's location
 * @param insertion1 - Optional single insertion factory to add custom methods, computed values or side effects to the query param manager.
 *   The insertion receives a context with `state`, `config`, `set`, `update`, `patch` and `reset`.
 *   To attach several insertions, compose them with `craftPipe`:
 *   `queryParam(config, (context) => craftPipe(context, insertion1, insertion2))` —
 *   each member then also sees the previous members' outputs on `context.insertions`.
 *   Methods bound to a source using `afterRecomputation` (effectRef-like) are not exposed in the output.
 * @returns A signal that returns the current query parameter state, extended with:
 *   - Individual signals for each query parameter (e.g., `queryParam.page()`)
 *   - Custom methods from insertions (excluding methods bound to sources)
 *   - `_config`: The original configuration
 *
 * @example
 * Basic usage
 * ```ts
 * const myQueryParams = queryParam(
 *   {
 *     state: {
 *       page: {
 *         fallbackValue: 1,
 *         parse: (value) => parseInt(value, 10),
 *         serialize: (value) => String(value),
 *       },
 *       pageSize: {
 *         fallbackValue: 10,
 *         parse: (value) => parseInt(value, 10),
 *         serialize: (value) => String(value),
 *       },
 *     },
 *   },
 *   ({ set, update, patch, reset }) => ({ set, update, patch, reset })
 * );
 *
 * // Access state
 * console.log(myQueryParams()); // { page: 1, pageSize: 10 }
 * console.log(myQueryParams.page()); // 1
 *
 * // Update state (also updates URL)
 * myQueryParams.set({ page: 2, pageSize: 20 });
 * myQueryParams.update(current => ({ ...current, page: current.page + 1 }));
 * myQueryParams.patch({ pageSize: 50 });
 * myQueryParams.reset();
 * ```
 *
 * @example
 * With custom methods via insertions
 * ```ts
 * const myQueryParams = queryParam(
 *   {
 *     state: {
 *       page: { fallbackValue: 1, parse: parseInt, serialize: String },
 *     },
 *   },
 *   ({ state, set }) => ({
 *     goTo: (newPage: number) => {
 *       set({ ...state(), page: newPage });
 *     },
 *   })
 * );
 *
 * myQueryParams.goTo(5); // Custom method from insertion
 * ```
 *
 * @example
 * Parse exceptions with `craftException`
 * ```ts
 * import { craftException, queryParam } from '@craft-ng/core';
 *
 * const mode = queryParam({
 *   state: {
 *     mode: {
 *       fallbackValue: 'success' as const,
 *       parse: (value: string) =>
 *         value === 'success'
 *           ? ('success' as const)
 *           : craftException(
 *               { code: 'INVALID_MODE_FROM_URL' },
 *               { received: value },
 *             ),
 *       serialize: (value) => String(value),
 *     },
 *   },
 * });
 *
 * console.log(mode.mode()); // fallbackValue when parse exception occurs
 * console.log(mode.hasException()); // true/false
 * console.log(mode.exceptions().parse.mode?.INVALID_MODE_FROM_URL);
 * ```
 */
export function queryParam<
  QueryParamsType extends Record<string, AnyQueryParamConfig>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
): QueryParamOutput<QueryParamsType, {}, QueryParamsState>;
export function queryParam<
  QueryParamsType extends Record<string, AnyQueryParamConfig>,
  Insertion1,
  Insertion1Yielded = never,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
  insertion1: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): QueryParamOutput<
  QueryParamsType,
  Insertion1,
  QueryParamsState,
  QueryParamTrackedDependencies<QueryParamsType, Insertion1Yielded>
>;
/**
 *
 * If it is not called in an injection context, it returns the config under _config.
 */
export function queryParam<
  QueryParamsType extends Record<string, AnyQueryParamConfig>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
  ...insertions: any[]
): QueryParamOutput<QueryParamsType, {}, QueryParamsState> {
  try {
    assertInInjectionContext(queryParam);
  } catch (e) {
    return {
      _config: config,
    } as any;
  }

  const insertionSnapshotRegistry = new InsertionSnapshotRegistry();
  const injector = ɵcreateHostTaggedInjector(inject(Injector), 'queryParam', [
    { provide: INSERTION_SNAPSHOT_REGISTRY, useValue: insertionSnapshotRegistry },
  ]);
  const router = inject(Router);
  const activatedRoute = inject(ActivatedRoute);

  const { state: queryParamsConfig, ...options } = config;

  // Create signals for each query parameter
  const queryParamFromUrl = linkedSignal(() => {
    return (
      router.currentNavigation()?.extractedUrl.queryParams ??
      activatedRoute.snapshot.queryParams
    );
  });

  // Create computed signals for each query parameter with parsing
  const queryParamsState = linkedSignal(() =>
    Object.entries(queryParamsConfig).reduce(
      (acc, [key, config]) => {
        const rawValue = queryParamFromUrl()?.[key];
        if (rawValue === undefined || rawValue === null) {
          acc[key] = config.fallbackValue;
          return acc;
        }
        try {
          const parsedValue = executeQueryParamFactory(
            injector,
            config.parse,
            config,
            rawValue,
          );
          if (isCraftException(parsedValue)) {
            acc[key] = config.fallbackValue;
            return acc;
          }
          acc[key] = parsedValue;
          return acc;
        } catch {
          acc[key] = config.fallbackValue;
          return acc;
        }
      },
      {} as Record<string, unknown>,
    ),
  ) as WritableSignal<QueryParamsToState<QueryParamsType>>;

  const parseExceptions = computed(() =>
    Object.entries(queryParamsConfig).reduce(
      (acc, [key, config]) => {
        const rawValue = queryParamFromUrl()?.[key];
        if (rawValue === undefined || rawValue === null) {
          return acc;
        }

        try {
          const parsedValue = executeQueryParamFactory(
            injector,
            config.parse,
            config,
            rawValue,
          );
          if (isCraftException(parsedValue)) {
            acc[key] = enrichQueryParamParseException(parsedValue, key);
          }
          return acc;
        } catch (error) {
          if (isCraftException(error)) {
            acc[key] = enrichQueryParamParseException(error, key);
          }
          return acc;
        }
      },
      {} as Record<string, AnyCraftException>,
    ),
  );

  const exceptions = computed(() => {
    const parse = parseExceptions();
    return {
      list: Object.values(parse),
      parse,
    };
  }) as Signal<QueryParamExceptions<QueryParamsType>>;

  const hasException = computed(() => exceptions().list.length > 0);

  // Get initial values from the url or use the fallback values
  const getDefaultState = () =>
    Object.entries(queryParamsConfig).reduce(
      (acc, [key, config]) => {
        acc[key] = config.fallbackValue;
        return acc;
      },
      {} as Record<string, unknown>,
    ) as QueryParamsToState<QueryParamsType>;

  // Save the original set method before we override it
  const originalSet = queryParamsState.set.bind(queryParamsState);

  // Navigation helper
  const navigate = (
    newState: QueryParamsToState<QueryParamsType>,
    navOptions?: QueryParamNavigationOptions,
  ) => {
    // Update the local state first using the original set method
    originalSet(newState);

    // Then navigate without triggering another update
    const mergedOptions = { ...options, ...navOptions };
    // Only include params that differ from their fallback values (SEO optimization)
    const serializedParams = Object.entries(queryParamsConfig).reduce(
      (acc, [key, config]) => {
        const currentValue = newState[key];
        // Skip if value equals fallback value
        if (currentValue !== config.fallbackValue) {
          acc[key] = executeQueryParamFactory(
            injector,
            config.serialize,
            config,
            currentValue,
          );
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    // Use queueMicrotask to avoid call stack issues
    queueMicrotask(() => {
      router.navigate([], {
        relativeTo: activatedRoute,
        queryParams: serializedParams,
        queryParamsHandling: mergedOptions.queryParamsHandling,
        onSameUrlNavigation: mergedOptions.onSameUrlNavigation,
        replaceUrl: mergedOptions.replaceUrl,
        skipLocationChange: mergedOptions.skipLocationChange,
      });
    });
  };

  // Create individual property signals
  const props = Object.entries(queryParamsConfig).reduce(
    (acc, [key, config]) => {
      acc[key] = computed(() => queryParamsState()[key]);
      return acc;
    },
    {} as Record<string, Signal<unknown>>,
  );

  // Create methods
  const methods = {
    set: (
      params: QueryParamsToState<QueryParamsType>,
      navOptions?: QueryParamNavigationOptions,
    ) => {
      navigate(params, navOptions);
      return params;
    },
    update: (
      updateFn: (
        currentParams: QueryParamsToState<QueryParamsType>,
      ) => QueryParamsToState<QueryParamsType>,
      navOptions?: QueryParamNavigationOptions,
    ) => {
      const newState = updateFn(queryParamsState());
      navigate(newState, navOptions);
      return newState;
    },
    patch: (
      paramsOrPatchFn:
        | Partial<QueryParamsToState<QueryParamsType>>
        | ((
            currentParams: QueryParamsToState<QueryParamsType>,
          ) => Partial<QueryParamsToState<QueryParamsType>>),
      navOptions?: QueryParamNavigationOptions,
    ) => {
      const params =
        typeof paramsOrPatchFn === 'function'
          ? paramsOrPatchFn(queryParamsState())
          : paramsOrPatchFn;
      const newState = { ...queryParamsState(), ...params };
      navigate(newState, navOptions);
      return newState;
    },
    reset: (navOptions?: QueryParamNavigationOptions) => {
      const defaultState = getDefaultState();
      navigate(defaultState, navOptions);
    },
  };

  runInInjectionContext(injector, () =>
    ɵobservePrimitiveResourceRuntimeContext(
      ɵcreatePrimitiveResourceRuntimeContext('queryParam', {
        state: queryParamsState.asReadonly(),
        set: (value) =>
          methods.set(value as QueryParamsToState<QueryParamsType>),
        update: (updater) =>
          methods.update(
            (current) =>
              updater(current) as QueryParamsToState<QueryParamsType>,
          ),
      }),
    ),
  );

  // Process insertions
  const insertionResults =
    (insertions as InsertionsQueryParamsFactory<QueryParamsType, {}>[])?.reduce(
      (acc, insert) => {
        const newInsertions = executeQueryParamFactory(
          injector,
          insert,
          undefined,
          {
            state: queryParamsState.asReadonly(),
            config: queryParamsConfig,
            hasException,
            exceptions,
            ...methods,
            insertions: acc as {},
          } as InsertionQueryParamsFactoryContext<QueryParamsType, {}>,
        );
        const wrappedInsertions = Object.entries(newInsertions).reduce(
          (wrappedAcc, [key, value]) => {
            if (typeof value !== 'function' || isSignal(value)) {
              wrappedAcc[key] = value;
              return wrappedAcc;
            }
            const methodInjector = ɵcreateHostTaggedInjector(
              injector,
              `method:${key}`,
              [
                ɵprovidePrimitiveMethodRuntimeContext(
                  'queryParam',
                  {
                    state: queryParamsState.asReadonly(),
                    set: (next) =>
                      methods.set(
                        next as QueryParamsToState<QueryParamsType>,
                      ),
                    update: (updater) =>
                      methods.update(
                        (current) =>
                          updater(current) as QueryParamsToState<QueryParamsType>,
                      ),
                    patch: (patchFn) =>
                      methods.patch((current) =>
                        patchFn(
                          current,
                        ) as Partial<QueryParamsToState<QueryParamsType>>,
                      ),
                  },
                  value as (...args: never[]) => unknown,
                ),
              ],
            );
            const wrappedFn = runInInjectionContext(methodInjector, () =>
              injectFnWrapper()(value as (...args: unknown[]) => unknown),
            );
            wrappedAcc[key] = (...args: unknown[]) =>
              runInInjectionContext(methodInjector, () => {
                const result = (wrappedFn as (...a: unknown[]) => unknown)(
                  ...args,
                );
                if (isGenerator(result)) {
                  return runCraftGenerator({
                    iterator: result,
                    injector: methodInjector,
                    hostScope: 'function',
                    invalidYieldErrorMessage:
                      QUERY_PARAM_INVALID_YIELD_ERROR_MESSAGE,
                    multipleAppStartErrorMessage:
                      QUERY_PARAM_APP_START_ERROR_MESSAGE,
                    onAppStartNotSupportedErrorMessage:
                      QUERY_PARAM_APP_START_ERROR_MESSAGE,
                  }).value;
                }
                return result;
              });
            return wrappedAcc;
          },
          {} as Record<string, unknown>,
        );
        return {
          ...acc,
          ...wrappedInsertions,
        };
      },
      {} as Record<string, unknown>,
    ) || {};

  const queryParamOutput = Object.assign(
    queryParamsState.asReadonly(),
    props,
    insertionResults,
    { hasException, exceptions, _config: config },
  ) as unknown as QueryParamOutput<QueryParamsType, {}, QueryParamsState>;

  const snapshotRegistry = injector.get(APP_SNAPSHOT_REGISTRY, null);
  const hostTagList: readonly string[] =
    injector.get(ɵHOST_TAG_LIST, null) ?? [];

  const destroyRefParam = injector.get(DestroyRef, null);

  if (snapshotRegistry && destroyRefParam) {
    snapshotRegistry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRefParam))
      .subscribe(() => {
        const insertionSnapshots = triggerAndCollectInsertions(insertionSnapshotRegistry);
        let stateSnapshot: unknown;
        try {
          stateSnapshot = {
            value: queryParamsState(),
            ...(insertionSnapshots ? { insertions: insertionSnapshots } : {}),
          };
        } catch (error) {
          stateSnapshot = { error: error instanceof Error ? error.message : String(error) };
        }
        snapshotRegistry.allSnapShot$.next({
          source: 'queryParam',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  return queryParamOutput;
}
