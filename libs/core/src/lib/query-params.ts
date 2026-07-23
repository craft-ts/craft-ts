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
import {
  createPrimitiveGen,
  type CraftPrimitiveGen,
} from './craft-primitive-gen';
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

export interface QueryParamsNavigationOptions {
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

type QueryParamsSingleConfigYielded<Config> = Config extends {
  parse: infer Parse;
  serialize: infer Serialize;
}
  ? ExtractFactoryYielded<Parse> | ExtractFactoryYielded<Serialize>
  : never;

type QueryParamsConfigYielded<QueryParamsType> = {
  [K in keyof QueryParamsType]: QueryParamsSingleConfigYielded<QueryParamsType[K]>;
}[keyof QueryParamsType];

type RouterQueryParamsYield = ServiceYieldRequest<
  'global',
  Router,
  ServiceTrackingMetadata<'Router', 'global', Router, never, undefined, never, false>
>;

type QueryParamsTrackedDependencies<
  QueryParamsType,
  InsertionsYielded = never,
> = ServiceDependencyMapFromYielded<
  RouterQueryParamsYield | QueryParamsConfigYielded<QueryParamsType> | InsertionsYielded
>;

type AnyQueryParamsConfig = QueryParamsConfig<any>;

export type QueryParamsToState<QueryParamsConfigs> = {
  [K in keyof QueryParamsConfigs]: 'parse' extends keyof QueryParamsConfigs[K]
    ? QueryParamsConfigs[K]['parse'] extends (...args: any[]) => unknown
      ? StripCraftException<ResolveFactoryResult<QueryParamsConfigs[K]['parse']>>
      : 'Error1: QueryParamsToState'
    : 'Error2: QueryParamsToState';
};

type QueryParamsParseExceptionsByKey<QueryParamsType> =
  QueryParamsType extends Record<string, AnyQueryParamsConfig>
    ? {
        [K in keyof QueryParamsType]: InsertMetaInCraftExceptionIfExists<
          ExtractCraftException<ResolveFactoryResult<QueryParamsType[K]['parse']>>,
          'parse',
          K & string
        >;
      }
    : Record<string, never>;

type QueryParamsParseExceptionUnion<QueryParamsType> =
  QueryParamsParseExceptionsByKey<QueryParamsType>[keyof QueryParamsParseExceptionsByKey<QueryParamsType>];

export type QueryParamsExceptions<QueryParamsType> = {
  list: QueryParamsParseExceptionUnion<QueryParamsType>[];
  parse: Partial<QueryParamsParseExceptionsByKey<QueryParamsType>>;
};

export type QueryParamsOutput<
  QueryParamsType,
  Insertions,
  QueryParamsState,
  Dependencies = QueryParamsTrackedDependencies<QueryParamsType>,
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
          exceptions: Signal<QueryParamsExceptions<QueryParamsType>>;
        },
        {
          _config: QueryParamsType;
          readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
        },
      ]
    >;

function enrichQueryParamsParseException(
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
  'queryParams generators can only yield craftService dependencies or exposed dependency helpers.';
const QUERY_PARAM_APP_START_ERROR_MESSAGE =
  'queryParams generators do not support onAppStart(...).';

function executeQueryParamsFactory<This, Args extends unknown[], Result>(
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

export type QueryParamsParser<T = unknown> = (
  value: string,
) => T | Generator<unknown, T, unknown>;

export type QueryParamsSerializer<T = unknown> = (
  value: NoInfer<T>,
) => string | Generator<unknown, string, unknown>;

export interface QueryParamsConfig<
  T = unknown,
  Parse extends QueryParamsParser<T> = QueryParamsParser<T>,
  Serialize extends QueryParamsSerializer<T> = QueryParamsSerializer<T>,
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
 *   `queryParams(config, (context) => craftPipe(context, insertion1, insertion2))` —
 *   each member then also sees the previous members' outputs on `context.insertions`.
 *   Methods bound to a source using `afterRecomputation` (effectRef-like) are not exposed in the output.
 * @returns A signal that returns the current query parameter state, extended with:
 *   - Individual signals for each query parameter (e.g., `queryParams.page()`)
 *   - Custom methods from insertions (excluding methods bound to sources)
 *   - `_config`: The original configuration
 *
 * @example
 * Basic usage
 * ```ts
 * const myQueryParams = craftUse(queryParams(
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
 * ));
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
 * const myQueryParams = craftUse(queryParams(
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
 * ));
 *
 * myQueryParams.goTo(5); // Custom method from insertion
 * ```
 *
 * @example
 * Parse exceptions with `craftException`
 * ```ts
 * import { craftException, queryParams } from '@craft-ng/core';
 *
 * const mode = craftUse(queryParams({
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
 * }));
 *
 * console.log(mode.mode()); // fallbackValue when parse exception occurs
 * console.log(mode.hasException()); // true/false
 * console.log(mode.exceptions().parse.mode?.INVALID_MODE_FROM_URL);
 * ```
 */
export function queryParams<
  QueryParamsType extends Record<string, AnyQueryParamsConfig>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamsNavigationOptions,
): CraftPrimitiveGen<QueryParamsOutput<QueryParamsType, {}, QueryParamsState>>;
export function queryParams<
  QueryParamsType extends Record<string, AnyQueryParamsConfig>,
  Insertion1,
  Insertion1Yielded = never,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamsNavigationOptions,
  insertion1: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): CraftPrimitiveGen<
  QueryParamsOutput<
    QueryParamsType,
    Insertion1,
    QueryParamsState,
    QueryParamsTrackedDependencies<QueryParamsType, Insertion1Yielded>
  >
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function queryParams(config: any, ...insertions: any[]): any {
  return createPrimitiveGen(createQueryParamsRef(config, ...insertions));
}

/**
 *
 * If it is not called in an injection context, it returns the config under _config.
 */
function createQueryParamsRef<
  QueryParamsType extends Record<string, AnyQueryParamsConfig>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamsNavigationOptions,
  ...insertions: any[]
): QueryParamsOutput<QueryParamsType, {}, QueryParamsState> {
  try {
    assertInInjectionContext(queryParams);
  } catch (e) {
    return {
      _config: config,
    } as any;
  }

  const insertionSnapshotRegistry = new InsertionSnapshotRegistry();
  const injector = ɵcreateHostTaggedInjector(inject(Injector), 'queryParams', [
    { provide: INSERTION_SNAPSHOT_REGISTRY, useValue: insertionSnapshotRegistry },
  ]);
  const router = inject(Router);
  const activatedRoute = inject(ActivatedRoute);

  const { state: queryParamsConfig, ...options } = config;

  // Create signals for each query parameter
  const queryParamsFromUrl = linkedSignal(() => {
    return (
      router.currentNavigation()?.extractedUrl.queryParams ??
      activatedRoute.snapshot.queryParams
    );
  });

  // Create computed signals for each query parameter with parsing
  const queryParamsState = linkedSignal(() =>
    Object.entries(queryParamsConfig).reduce(
      (acc, [key, config]) => {
        const rawValue = queryParamsFromUrl()?.[key];
        if (rawValue === undefined || rawValue === null) {
          acc[key] = config.fallbackValue;
          return acc;
        }
        try {
          const parsedValue = executeQueryParamsFactory(
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
        const rawValue = queryParamsFromUrl()?.[key];
        if (rawValue === undefined || rawValue === null) {
          return acc;
        }

        try {
          const parsedValue = executeQueryParamsFactory(
            injector,
            config.parse,
            config,
            rawValue,
          );
          if (isCraftException(parsedValue)) {
            acc[key] = enrichQueryParamsParseException(parsedValue, key);
          }
          return acc;
        } catch (error) {
          if (isCraftException(error)) {
            acc[key] = enrichQueryParamsParseException(error, key);
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
  }) as Signal<QueryParamsExceptions<QueryParamsType>>;

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
    navOptions?: QueryParamsNavigationOptions,
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
          acc[key] = executeQueryParamsFactory(
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
      navOptions?: QueryParamsNavigationOptions,
    ) => {
      navigate(params, navOptions);
      return params;
    },
    update: (
      updateFn: (
        currentParams: QueryParamsToState<QueryParamsType>,
      ) => QueryParamsToState<QueryParamsType>,
      navOptions?: QueryParamsNavigationOptions,
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
      navOptions?: QueryParamsNavigationOptions,
    ) => {
      const params =
        typeof paramsOrPatchFn === 'function'
          ? paramsOrPatchFn(queryParamsState())
          : paramsOrPatchFn;
      const newState = { ...queryParamsState(), ...params };
      navigate(newState, navOptions);
      return newState;
    },
    reset: (navOptions?: QueryParamsNavigationOptions) => {
      const defaultState = getDefaultState();
      navigate(defaultState, navOptions);
    },
  };

  runInInjectionContext(injector, () =>
    ɵobservePrimitiveResourceRuntimeContext(
      ɵcreatePrimitiveResourceRuntimeContext('queryParams', {
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
        const newInsertions = executeQueryParamsFactory(
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
                  'queryParams',
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

  const queryParamsOutput = Object.assign(
    queryParamsState.asReadonly(),
    props,
    insertionResults,
    { hasException, exceptions, _config: config },
  ) as unknown as QueryParamsOutput<QueryParamsType, {}, QueryParamsState>;

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
          source: 'queryParams',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  return queryParamsOutput;
}
