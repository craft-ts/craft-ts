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
  QueryParamsMethods,
} from './query.core';
import { MergeObjects } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { Prettify } from './util/util.type';
import { ActivatedRoute, Router } from '@angular/router';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import {
  AnyCraftException,
  craftException,
  isCraftException,
} from './craft-exception';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import {
  createNamedPrimitiveGen,
  type CraftPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYieldedAndValues,
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
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  yieldableInvocation,
} from './yieldable';
import {
  createYieldableReactiveFacade,
  createYieldableReactiveValue,
  deepYieldable,
  hasDeepYieldableInsertion,
  isYieldableReactiveValue,
  nameInsertedReactiveValue,
  type YieldableReactiveProperties,
  type YieldableReactiveValue,
} from './reactive-read';
import type { YieldableInsertionMethods } from './yieldable';

export interface QueryParamsNavigationOptions {
  queryParamsHandling?: 'merge' | 'preserve' | '';
  onSameUrlNavigation?: 'reload' | 'ignore';
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
}

type ResolveGeneratorResult<Result> =
  Result extends Generator<any, infer Output, unknown> ? Output : Result;

type RouterQueryParamsYield = ServiceYieldRequest<
  'global',
  Router,
  ServiceTrackingMetadata<
    'Router',
    'global',
    Router,
    never,
    undefined,
    never,
    false
  >
>;

type QueryParamsTrackedDependencies<
  QueryParamsType,
  InsertionsYielded = never,
  Insertions = never,
> = ServiceDependencyMapFromYieldedAndValues<
  RouterQueryParamsYield | InsertionsYielded,
  Insertions
>;

type AnyQueryParamsConfig = {
  codec: QueryParamsCodec<any, any>;
  fallbackValue: any;
};

export type QueryParamsToState<QueryParamsConfigs> = {
  [K in keyof QueryParamsConfigs]: QueryParamsConfigs[K] extends {
    codec: { decode: (input: any) => infer Decoded };
  }
    ? Exclude<Decoded, AnyCraftException>
    : never;
};

export type QueryParamDecodeErrorPayload = {
  key: string;
  value: unknown;
  error: unknown;
};

export type QueryParamDecodeError<Key extends string = string> =
  import('./craft-exception').CraftExceptionResult<
    {
      code: 'QueryParamDecodeError';
      scope: 'parse';
      identifier: Key;
    },
    QueryParamDecodeErrorPayload & { key: Key }
  >;

export type QueryParamEncodeErrorPayload = {
  key: string;
  value: unknown;
  error: unknown;
};

export type QueryParamEncodeError =
  import('./craft-exception').CraftExceptionResult<
    {
      code: 'QueryParamEncodeError';
      scope: 'serialize';
    },
    QueryParamEncodeErrorPayload
  >;

type QueryParamsParseExceptionsByKey<QueryParamsType> =
  QueryParamsType extends Record<string, AnyQueryParamsConfig>
    ? {
        [K in keyof QueryParamsType]: QueryParamDecodeError<K & string>;
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
> = YieldableReactiveValue<QueryParamsState> &
  YieldableReactiveProperties<
    MergeObjects<
      [
        {
          [K in keyof QueryParamsState]: Signal<QueryParamsState[K]>;
        },
        IsEmptyObject<Insertions> extends true
          ? {}
          : YieldableInsertionMethods<FilterSource<Insertions>>,
        {
          hasException: Signal<boolean>;
          exceptions: Signal<QueryParamsExceptions<QueryParamsType>>;
        },
        {
          _config: QueryParamsType;
          readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
        },
      ]
    >
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

function createQueryParamDecodeError(
  key: string,
  value: unknown,
  error: unknown,
): AnyCraftException {
  return craftException(
    {
      code: 'QueryParamDecodeError',
      scope: 'parse',
      identifier: key,
    },
    { key, value, error },
  );
}

function createQueryParamEncodeError(
  key: string,
  value: unknown,
  error: unknown,
): AnyCraftException {
  return craftException(
    {
      code: 'QueryParamEncodeError',
      scope: 'serialize',
    },
    { key, value, error },
  );
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

export interface QueryParamsCodecConfig<
  T = unknown,
  Encoded = unknown,
  Codec extends QueryParamsCodec<Encoded, T> = QueryParamsCodec<Encoded, T>,
> {
  codec: Codec;
  fallbackValue: NoInfer<T>;
}

type QueryParamsCodec<Encoded, Decoded> = {
  decode(input: Encoded): Decoded | AnyCraftException;
  encode(value: Decoded): Encoded | AnyCraftException;
};

export type QueryParamsConfig<
  T = unknown,
  Encoded = unknown,
> = QueryParamsCodecConfig<T, Encoded>;

/**
 * Creates a reactive query parameter manager that synchronizes state with URL query parameters.
 *
 * This function manages query parameter state by:
 * - Reading initial values from the URL or using default values
 * - Decoding URL values into typed values using the provided `codec`
 * - Encoding typed values back to URL values using the provided `codec`
 * - Providing reactive signals for each query parameter
 *
 * @remarks
 * **Important:** This function must be called within an injection context.
 * If called outside an injection context, it will only return an object containing the configuration under `_config`.
 *
 * @param name - The query params manager name. Used to key the returned record
 *   (`const pagination = yield* queryParams('pagination', config)`) and as the
 *   injector host tag (`queryParams:pagination`), so the primitive is precisely
 *   locatable in snapshots and logs.
 * @param config - Configuration object containing:
 *   - `state`: Record of query parameter configurations, each with `fallbackValue` and `codec`
 *   - `queryParamsHandling` (optional): How to handle existing query params ('merge' | 'preserve' | '')
 *   - `onSameUrlNavigation` (optional): Behavior on same URL navigation ('reload' | 'ignore')
 *   - `replaceUrl` (optional): Whether to replace the URL in browser history
 *   - `skipLocationChange` (optional): Whether to skip updating the browser's location
 * @param insertion1 - Optional single insertion factory to add custom methods, computed values or side effects to the query param manager.
 *   The insertion receives a context with `state`, `config`, `set`, `update`, `patch` and `reset`.
 *   To attach several insertions, compose them with `insertQueryParamsPipe`:
 *   `queryParams('name', config, insertQueryParamsPipe(insertion1, insertion2))` —
 *   each member then also sees the previous members' outputs on `context.insertions`.
 *   Methods bound to a source using `afterRecomputation` (effectRef-like) are not exposed in the output.
 * @returns A single-use primitive generator resolving to a signal returning
 *   the current query parameter state,
 *   extended with:
 *   - Individual signals for each query parameter (e.g., `pagination.page()`)
 *   - Custom methods from insertions (excluding methods bound to sources)
 *   - `_config`: The original configuration
 *
 *   Consume it with `yield*` inside a generator host (craftService factory,
 *   craftGen, …).
 *
 * @example
 * Basic usage
 * ```ts
 * const myQueryParams = yield* queryParams(
 *   'myQueryParams',
 *   {
 *     state: {
 *       page: {
 *         fallbackValue: 1,
 *         codec: {
 *           decode: (value) => parseInt(value, 10),
 *           encode: (value) => String(value),
 *         },
 *       },
 *       pageSize: {
 *         fallbackValue: 10,
 *         codec: {
 *           decode: (value) => parseInt(value, 10),
 *           encode: (value) => String(value),
 *         },
 *       },
 *     },
 *   },
 *   ({ set, update, patch, reset }) => ({ set, update, patch, reset })
 * );
 *
 * // Access state
 * console.log(yield* myQueryParams()); // { page: 1, pageSize: 10 }
 * console.log(yield* myQueryParams.page()); // 1
 *
 * // Update state (also updates URL)
 * yield* myQueryParams.set({ page: 2, pageSize: 20 });
 * yield* myQueryParams.update(current => ({ ...current, page: current.page + 1 }));
 * yield* myQueryParams.patch({ pageSize: 50 });
 * yield* myQueryParams.reset();
 * ```
 *
 * @example
 * With custom methods via insertions
 * ```ts
 * const myQueryParams = yield* queryParams(
 *   'myQueryParams',
 *   {
 *     state: {
 *       page: {
 *         fallbackValue: 1,
 *         codec: { decode: parseInt, encode: String },
 *       },
 *     },
 *   },
 *   ({ state, patch }) => ({
 *     goTo: function* (newPage: number) {
 *       const current = yield* state();
 *       return yield* patch({ ...current, page: newPage });
 *     },
 *   })
 * );
 *
 * yield* myQueryParams.goTo(5); // Custom method from insertion
 * ```
 *
 * @example
 * Parse exceptions with `craftException`
 * ```ts
 * import { craftException, queryParams } from '@craft-ng/core';
 *
 * const mode = yield* queryParams('mode', {
 *   state: {
 *     mode: {
 *       fallbackValue: 'success' as const,
 *       codec: {
 *         decode: (value: string) => {
 *           if (value !== 'success') {
 *             throw new Error(`Invalid mode: ${value}`);
 *           }
 *           return 'success' as const;
 *         },
 *         encode: (value) => String(value),
 *       },
 *     },
 *   },
 * });
 *
 * console.log(yield* mode.mode()); // fallbackValue when parse exception occurs
 * console.log(yield* mode.hasException()); // true/false
 * console.log((yield* mode.exceptions()).parse.mode?.INVALID_MODE_FROM_URL);
 * ```
 */
export function queryParams<
  Name extends string,
  QueryParamsType extends Record<string, AnyQueryParamsConfig>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  name: Name,
  config: { state: QueryParamsType } & QueryParamsNavigationOptions,
): NamedCraftPrimitiveGen<
  Name,
  QueryParamsOutput<QueryParamsType, {}, QueryParamsState>
>;
export function queryParams<
  Name extends string,
  QueryParamsType extends Record<string, AnyQueryParamsConfig>,
  Insertion1,
  Insertion1Yielded = never,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  name: Name,
  config: { state: QueryParamsType } & QueryParamsNavigationOptions,
  insertion1: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): NamedCraftPrimitiveGen<
  Name,
  QueryParamsOutput<
    QueryParamsType,
    Insertion1,
    QueryParamsState,
    QueryParamsTrackedDependencies<
      QueryParamsType,
      Insertion1Yielded,
      Insertion1
    >
  >
>;

export function queryParams(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return createNamedPrimitiveGen(
    name,
    createQueryParamsRef(name, config, ...insertions),
  );
}

/**
 *
 * If it is not called in an injection context, it returns the config under _config.
 */
function createQueryParamsRef<
  QueryParamsType extends Record<string, AnyQueryParamsConfig>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  name: string,
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
  const injector = ɵcreateHostTaggedInjector(
    inject(Injector),
    `queryParams:${name}`,
    [
      {
        provide: INSERTION_SNAPSHOT_REGISTRY,
        useValue: insertionSnapshotRegistry,
      },
    ],
  );
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
          const decoded = config.codec.decode(rawValue);
          acc[key] = isCraftException(decoded) ? config.fallbackValue : decoded;
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
          const decoded = config.codec.decode(rawValue);
          if (isCraftException(decoded)) {
            acc[key] = enrichQueryParamsParseException(decoded, key);
          }
          return acc;
        } catch (error) {
          acc[key] = enrichQueryParamsParseException(
            createQueryParamDecodeError(key, rawValue, error),
            key,
          );
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
    // Only include params that differ from their fallback values (SEO optimization)
    const serializedParams = Object.entries(queryParamsConfig).reduce(
      (acc, [key, config]) => {
        const currentValue = newState[key];
        // Skip if value equals fallback value
        if (currentValue !== config.fallbackValue) {
          try {
            const encoded = config.codec.encode(currentValue);
            if (isCraftException(encoded)) {
              throw createQueryParamEncodeError(key, currentValue, encoded);
            }
            acc[key] = encoded as string | string[];
          } catch (error) {
            throw createQueryParamEncodeError(key, currentValue, error);
          }
        }
        return acc;
      },
      {} as Record<string, string | string[]>,
    );

    // Update the local state only after all codecs have encoded successfully.
    originalSet(newState);

    // Then navigate without triggering another update
    const mergedOptions = { ...options, ...navOptions };

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

  const insertionMethods = {
    set: (
      params: QueryParamsToState<QueryParamsType>,
      navOptions?: QueryParamsNavigationOptions,
    ) =>
      yieldableInvocation(methods.set(params, navOptions)),
    update: (
      updateFn: (
        currentParams: QueryParamsToState<QueryParamsType>,
      ) => QueryParamsToState<QueryParamsType>,
      navOptions?: QueryParamsNavigationOptions,
    ) =>
      yieldableInvocation(methods.update(updateFn, navOptions)),
    patch: (
      paramsOrPatchFn:
        | Partial<QueryParamsToState<QueryParamsType>>
        | ((
            currentParams: QueryParamsToState<QueryParamsType>,
          ) => Partial<QueryParamsToState<QueryParamsType>>),
      navOptions?: QueryParamsNavigationOptions,
    ) =>
      yieldableInvocation(methods.patch(paramsOrPatchFn, navOptions)),
    reset: (navOptions?: QueryParamsNavigationOptions) =>
      yieldableInvocation(methods.reset(navOptions)),
  } as unknown as QueryParamsMethods<QueryParamsToState<QueryParamsType>>;

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
  const readonlyQueryParamsState = queryParamsState.asReadonly();
  const publicStateReader = createYieldableReactiveValue(
    readonlyQueryParamsState,
    'state',
    { primitive: 'queryParams', path: `${name}.state` },
  );
  const publicHasException = createYieldableReactiveValue(
    hasException,
    'hasException',
    { primitive: 'queryParams', path: `${name}.hasException` },
  );
  const publicExceptions = createYieldableReactiveValue(
    exceptions,
    'exceptions',
    { primitive: 'queryParams', path: `${name}.exceptions` },
  );
  const insertionResults =
    (insertions as InsertionsQueryParamsFactory<QueryParamsType, {}>[])?.reduce(
      (acc, insert) => {
        const newInsertions = executeQueryParamsFactory(
          injector,
          insert,
          undefined,
          {
            state: publicStateReader,
            config: queryParamsConfig,
            hasException: publicHasException,
            exceptions: publicExceptions,
            ...insertionMethods,
            insertions: acc as {},
          } as InsertionQueryParamsFactoryContext<QueryParamsType, {}>,
        );
        const wrappedInsertions = Object.entries(newInsertions).reduce(
          (wrappedAcc, [key, value]) => {
            if (
              typeof value !== 'function' ||
              isSignal(value) ||
              isNonYieldableInsertionMethod(value)
            ) {
              wrappedAcc[key] = nameInsertedReactiveValue(
                value,
                key,
                'queryParams',
                `${name}.${key}`,
              );
              return wrappedAcc;
            }
            if (isYieldableReactiveValue(value)) {
              wrappedAcc[key] = nameInsertedReactiveValue(
                value,
                key,
                'queryParams',
                `${name}.${key}`,
              );
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
                      methods.set(next as QueryParamsToState<QueryParamsType>),
                    update: (updater) =>
                      methods.update(
                        (current) =>
                          updater(
                            current,
                          ) as QueryParamsToState<QueryParamsType>,
                      ),
                    patch: (patchFn) =>
                      methods.patch(
                        (current) =>
                          patchFn(current) as Partial<
                            QueryParamsToState<QueryParamsType>
                          >,
                      ),
                  },
                  value as (...args: never[]) => unknown,
                ),
              ],
            );
            const wrappedFn = runInInjectionContext(methodInjector, () =>
              injectFnWrapper()(value as (...args: unknown[]) => unknown),
            );
            wrappedAcc[key] = createYieldableInsertionMethod(wrappedFn, {
              injector: methodInjector,
              invalidYieldErrorMessage: QUERY_PARAM_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_PARAM_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage:
                QUERY_PARAM_APP_START_ERROR_MESSAGE,
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

  const queryParamsCallable = readonlyQueryParamsState;
  Object.defineProperty(queryParamsCallable, 'name', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  const queryParamsOutput = Object.assign(
    queryParamsCallable,
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
        const insertionSnapshots = triggerAndCollectInsertions(
          insertionSnapshotRegistry,
        );
        let stateSnapshot: unknown;
        try {
          stateSnapshot = {
            value: queryParamsState(),
            ...(insertionSnapshots ? { insertions: insertionSnapshots } : {}),
          };
        } catch (error) {
          stateSnapshot = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
        snapshotRegistry.allSnapShot$.next({
          source: 'queryParams',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  const publicQueryParams = createYieldableReactiveFacade(queryParamsOutput, {
    name,
    primitive: 'queryParams',
    path: name,
  });
  return (hasDeepYieldableInsertion(insertions)
    ? deepYieldable(publicQueryParams)
    : publicQueryParams) as QueryParamsOutput<QueryParamsType, {}, QueryParamsState>;
}
