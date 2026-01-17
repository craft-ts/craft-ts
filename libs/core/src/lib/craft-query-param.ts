import { Injector, isSignal, Signal, WritableSignal } from '@angular/core';
import {
  ContextConstraints,
  ContextInput,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';
import { capitalize } from './util/util';
import { QueryParamConfig, QueryParamOutput } from './query-param';
import { DeferredExtract } from './util/util.type';

export type SpecificCraftQueryParamOutputs<
  QueryParamsName extends string,
  QueryParamsType,
  Insertions,
  QueryParamsState,
> =
  DeferredExtract<Insertions> extends infer Extracted
    ? Extracted extends { props: unknown; methods: Record<string, Function> }
      ? PartialContext<{
          props: {
            [key in QueryParamsName]: Signal<QueryParamsState>;
          } & {
            [K in keyof QueryParamsState as `${QueryParamsName &
              string}${Capitalize<K & string>}`]: Signal<QueryParamsState[K]>;
          } & {
            [key in keyof Extracted['props'] as `${QueryParamsName &
              string}${Capitalize<key & string>}`]: Extracted['props'][key];
          };
          methods: {
            [key in keyof Extracted['methods'] as `${key & string}${Capitalize<
              QueryParamsName & string
            >}`]: Extracted['methods'][key];
          };
          _queryParams: {
            [K in QueryParamsName]: {
              config: QueryParamsType;
              state: WritableSignal<QueryParamsState>;
            };
          };
        }>
      : never
    : never;

type SpecificCraftQueryParamStandaloneOutputs<
  QueryParamsName extends string,
  QueryParamsType,
  Insertions,
  QueryParamsState,
> = {
  [K in QueryParamsName as `set${Capitalize<K>}QueryParams`]: <
    T extends Partial<{
      [K in keyof QueryParamsState]: QueryParamsState[K];
    }>,
  >(
    params: T,
  ) => T;
};

type CraftQueryParamOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  QueryParamsName extends string,
  QueryParamsType,
  Insertions,
  QueryParamsState,
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftQueryParamOutputs<
    QueryParamsName,
    QueryParamsType,
    Insertions,
    QueryParamsState
  >,
  SpecificCraftQueryParamStandaloneOutputs<
    QueryParamsName,
    QueryParamsType,
    Insertions,
    QueryParamsState
  >
>;

/**
 * Creates a craft factory for reactive query parameter management integrated with the craft store.
 *
 * This function integrates query parameter management into a craft store by:
 * - Creating typed signals for each query parameter prefixed with the provided name
 * - Exposing methods to update query parameters
 * - Providing a standalone method to serialize query params for navigation outside injection context
 * - Synchronizing with URL query parameters automatically
 *
 * @remarks
 * **Important:** The `queryParamFactory` function must return a `queryParam()` call.
 * Since `queryParam()` requires an injection context, `craftQueryParam` handles this by:
 * - Calling the factory within an injection context to create the reactive query param manager
 * - Calling the factory outside injection context to extract the configuration for standalone methods
 *
 * **Warning:** Be careful to avoid query params key collisions. (There is no verification yet)
 *
 * @param queryParamsName - Name used to prefix generated signals and methods
 * @param queryParamFactory - Factory function that receives craft context and returns a QueryParamOutput
 * @returns A craft factory function with standalone methods for serializing query params
 *
 * @example
 * Basic usage with craft
 * ```ts
 * const { injectCraft, setPaginationQueryParams } = craft(
 *   {
 *     providedIn: 'root',
 *     name: 'myStore',
 *   },
 *   craftQueryParam('pagination', () =>
 *     queryParam({
 *       state: {
 *         page: {
 *           fallbackValue: 1,
 *           parse: (value: string) => parseInt(value, 10),
 *           serialize: (value: unknown) => String(value),
 *         },
 *         pageSize: {
 *           fallbackValue: 10,
 *           parse: (value: string) => parseInt(value, 10),
 *           serialize: (value: unknown) => String(value),
 *         },
 *       },
 *     }, ({set, update, patch, reset}) => ({set, update, patch, reset}))
 *   )
 * );
 *
 * // In a component (injection context):
 * const store = injectCraft();
 *
 * // Accessing query param values
 * store.paginationPage();       // Signal<number> for 'page' query param
 * store.paginationPageSize();   // Signal<number> for 'pageSize' query param
 * store.pagination();            // Signal<{ page: number; pageSize: number }>
 *
 * // Updating query param values (also updates URL)
 * store.setPagination({ page: 2, pageSize: 20 });
 * store.updatePagination(current => ({ ...current, page: current.page + 1 }));
 * store.patchPagination({ pageSize: 50 });
 * store.resetPagination();
 * ```
 *
 * @example
 * Using standalone method for navigation outside injection context
 * ```ts
 * // Outside injection context (e.g., in a route resolver, guard, or service method):
 * async navigateToMyPage() {
 *   await router.navigate(['my-page'], {
 *     queryParams: setPaginationQueryParams({ page: 4, pageSize: 20 }),
 *   });
 * }
 *
 * navigateByUrlToMyPage() {
 *   router.navigateByUrl(
 *     `/my-page?${setPaginationQueryParams({ page: 4, pageSize: 20 })}`
 *   );
 * }
 * ```
 *
 * @example
 * With custom methods via insertions
 * ```ts
 * const { injectCraft } = craft(
 *   {
 *     providedIn: 'root',
 *     name: '',
 *   },
 *   craftQueryParam('pagination', () =>
 *     queryParam(
 *       {
 *         state: {
 *           page: { fallbackValue: 1, parse: parseInt, serialize: String },
 *         },
 *       },
 *       ({ state, set }) => ({
 *         goToPage: (newPage: number) => {
 *           set({ ...state(), page: newPage });
 *         },
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 * store.goToPagePagination(5); // Custom method from insertion
 * ```
 */
export function craftQueryParam<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  const QueryParamsName extends string,
  QueryParamsType,
  Insertions,
  QueryParamsState,
>(
  queryParamsName: QueryParamsName,
  queryParamFactory: (
    context: CraftFactoryEntries<Context>,
  ) => QueryParamOutput<QueryParamsType, Insertions, QueryParamsState>,
): CraftQueryParamOutputs<
  Context,
  StoreConfig,
  QueryParamsName,
  QueryParamsType,
  Insertions,
  QueryParamsState
> {
  const context = (
    contextData: ContextInput<Context>,
    injector: Injector,
    _storeConfig: StoreConfig,
    _cloudProxy: Context['_cloudProxy'],
  ) => {
    const queryParamState = queryParamFactory(craftFactoryEntries(contextData));

    const { props, methods } = Object.entries(queryParamState).reduce(
      (acc, [key, value]) => {
        if (isSignal(value)) {
          (acc.props as Record<string, Signal<any>>)[
            `${queryParamsName}${capitalize(key)}`
          ] = value;
        } else {
          (acc.methods as Record<string, Function>)[
            `${key}${capitalize(queryParamsName)}`
          ] = value;
        }
        return acc;
      },
      { props: {}, methods: {} } as {
        props: Record<string, Signal<any>>;
        methods: Record<string, Function>;
      },
    );

    return partialContext({
      props: {
        ...props,
        [`${queryParamsName}`]: queryParamState,
      },
      _queryParams: {
        [`${queryParamsName}`]: {
          config: queryParamState,
          state: queryParamState,
        },
      },
      methods,
    }) as SpecificCraftQueryParamOutputs<
      QueryParamsName,
      QueryParamsType,
      Insertions,
      QueryParamsState
    >;
  };

  // when queryParam is called outside the injection context, it will only return the config
  const queryParamsConfig = (
    queryParamFactory({}) as unknown as { _config: QueryParamsType }
  )._config as QueryParamsType;

  const setCurrentQueryParams = (
    params: Partial<{
      [K in keyof QueryParamsState]: QueryParamsState[K];
    }>,
  ) =>
    serializeQueryParams(
      params,
      queryParamsConfig as { state: Record<string, QueryParamConfig<unknown>> },
    );

  const setCurrentQueryParamsKey = `set${capitalize(
    queryParamsName,
  )}QueryParams`;

  return (() =>
    Object.assign(context, {
      [setCurrentQueryParamsKey]: setCurrentQueryParams,
    })) as unknown as CraftQueryParamOutputs<
    Context,
    StoreConfig,
    QueryParamsName,
    QueryParamsType,
    Insertions,
    QueryParamsState
  >;
}

export function serializeQueryParams<
  QueryParamsState extends Record<string, unknown>,
  QueryParamsConfig extends {
    state: Record<string, QueryParamConfig<unknown>>;
  },
>(params: QueryParamsState, queryParamsConfig: QueryParamsConfig) {
  const queryParamsObject = Object.entries(params).reduce(
    (acc, [key, value]) => {
      const paramConfig = queryParamsConfig.state[key];
      if (paramConfig && value !== undefined) {
        acc[key] = paramConfig.serialize(value);
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  const result = Object.defineProperty(queryParamsObject, 'toString', {
    value() {
      return serializedQueryParamsObjectToString(this);
    },
    enumerable: false, // 👈 ne s'affichera pas dans les clés
  });
  return result;
}

export function serializedQueryParamsObjectToString(
  queryParamsObject: Record<string, unknown>,
) {
  return Object.entries(queryParamsObject)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`,
    )
    .join('&');
}
