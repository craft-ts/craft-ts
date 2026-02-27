import {
  assertInInjectionContext,
  computed,
  inject,
  linkedSignal,
  Signal,
  WritableSignal,
} from '@angular/core';
import {
  InsertionsQueryParamsFactory,
  InsertionQueryParamsFactoryContext,
} from './query.core';
import { MergeObjects } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { Prettify } from './util/util.type';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AnyCraftException,
  ExtractCraftException,
  InsertMetaInCraftExceptionIfExists,
  StripCraftException,
  isCraftException,
} from './craft-exception';

export interface QueryParamNavigationOptions {
  queryParamsHandling?: 'merge' | 'preserve' | '';
  onSameUrlNavigation?: 'reload' | 'ignore';
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
}

export type QueryParamsToState<QueryParamConfigs> = {
  [K in keyof QueryParamConfigs]: 'parse' extends keyof QueryParamConfigs[K]
    ? QueryParamConfigs[K]['parse'] extends (value: string) => infer U
      ? StripCraftException<U>
      : 'Error1: QueryParamsToState'
    : 'Error2: QueryParamsToState';
};

type QueryParamParseExceptionsByKey<QueryParamsType> =
  QueryParamsType extends Record<string, QueryParamConfig<unknown>>
    ? {
        [K in keyof QueryParamsType]: InsertMetaInCraftExceptionIfExists<
          ExtractCraftException<ReturnType<QueryParamsType[K]['parse']>>,
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

export type QueryParamOutput<QueryParamsType, Insertions, QueryParamsState> =
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

export interface QueryParamConfig<T = unknown> {
  parse: (value: string) => T;
  fallbackValue: NoInfer<T>;
  serialize: (value: NoInfer<T>) => string;
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
 * @param insertions - Optional insertion functions to add custom methods, computed values or side effects to the query param manager.
 *   Insertions receive context with `state`, `config`, `set`, `update`, `patch`, `reset` and previous insertions.
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
 */
export function queryParam<
  QueryParamsType extends Record<string, QueryParamConfig<unknown>>,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
): QueryParamOutput<QueryParamsType, {}, QueryParamsState>;
export function queryParam<
  QueryParamsType extends Record<string, QueryParamConfig<unknown>>,
  Insertion1,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
  insertion1: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion1
  >,
): QueryParamOutput<QueryParamsType, Insertion1, QueryParamsState>;
export function queryParam<
  QueryParamsType extends Record<string, QueryParamConfig<unknown>>,
  Insertion1,
  Insertion2,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
  insertion1: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion1
  >,
  insertion2: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion2,
    Insertion1
  >,
): QueryParamOutput<QueryParamsType, Insertion1 & Insertion2, QueryParamsState>;
export function queryParam<
  QueryParamsType extends Record<string, QueryParamConfig<unknown>>,
  Insertion1,
  Insertion2,
  Insertion3,
  QueryParamsState = Prettify<QueryParamsToState<QueryParamsType>>,
>(
  config: { state: QueryParamsType } & QueryParamNavigationOptions,
  insertion1: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion1
  >,
  insertion2: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsQueryParamsFactory<
    NoInfer<QueryParamsType>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): QueryParamOutput<
  QueryParamsType,
  Insertion1 & Insertion2 & Insertion3,
  QueryParamsState
>;
/**
 *
 * If it is not called in an injection context, it returns the config under _config.
 */
export function queryParam<
  QueryParamsType extends Record<string, QueryParamConfig<unknown>>,
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
          const parsedValue = config.parse(rawValue);
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
          const parsedValue = config.parse(rawValue);
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
          acc[key] = config.serialize(currentValue);
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
    },
    update: (
      updateFn: (
        currentParams: QueryParamsToState<QueryParamsType>,
      ) => QueryParamsToState<QueryParamsType>,
      navOptions?: QueryParamNavigationOptions,
    ) => {
      const newState = updateFn(queryParamsState());
      navigate(newState, navOptions);
    },
    patch: (
      params: Partial<QueryParamsToState<QueryParamsType>>,
      navOptions?: QueryParamNavigationOptions,
    ) => {
      const newState = { ...queryParamsState(), ...params };
      navigate(newState, navOptions);
    },
    reset: (navOptions?: QueryParamNavigationOptions) => {
      navigate(getDefaultState(), navOptions);
    },
  };

  // Process insertions
  const insertionResults =
    (insertions as InsertionsQueryParamsFactory<QueryParamsType, {}>[])?.reduce(
      (acc, insert) => {
        const newInsertions = insert({
          state: queryParamsState.asReadonly(),
          config: queryParamsConfig,
          ...methods,
          insertions: acc as {},
        } as InsertionQueryParamsFactoryContext<QueryParamsType, {}>);
        return {
          ...acc,
          ...newInsertions,
        };
      },
      {} as Record<string, unknown>,
    ) || {};

  return Object.assign(queryParamsState.asReadonly(), props, insertionResults, {
    hasException,
    exceptions,
    _config: config,
  }) as unknown as QueryParamOutput<QueryParamsType, {}, QueryParamsState>;
}
