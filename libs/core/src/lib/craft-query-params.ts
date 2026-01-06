import { Injector, isSignal, Signal } from '@angular/core';
import {
  ContextConstraints,
  ContextInput,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  MergeTwoContexts,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { capitalize } from './util/util';
import { QueryParamConfig, QueryParamOutput } from './query-param';
import { UnionToTuple } from './util//types/util.type';
import {
  serializeQueryParams,
  SpecificCraftQueryParamOutputs,
} from './craft-query-param';

type ToSpecificCraftQueryParamsOutputs<
  QueryParamKeysTuple,
  QueryParams,
  Acc extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints
> = QueryParamKeysTuple extends [infer Head, ...infer Tail]
  ? Head extends keyof QueryParams
    ? QueryParams[Head] extends QueryParamOutput<
        infer QueryParamsType,
        infer Insertions,
        infer QueryParamsState
      >
      ? SpecificCraftQueryParamOutputs<
          Head & string,
          QueryParamsType,
          Insertions,
          QueryParamsState
        > extends infer Current
        ? Current extends ContextConstraints
          ? ToSpecificCraftQueryParamsOutputs<
              Tail,
              QueryParams,
              MergeTwoContexts<Acc, Current>,
              StoreConfig
            >
          : never
        : never
      : PartialContext<{
          _error: {
            message: `Typing Error: QueryParams '${Head &
              string}' value is not a QueryParamsOutput - store: [${StoreConfig['name']}]`;
          };
        }>
    : Acc
  : Acc;

export type SpecificCraftQueryParamsOutputs<
  QueryParamKeys extends keyof QueryParams,
  QueryParams extends Record<QueryParamKeys, unknown>,
  StoreConfig extends StoreConfigConstraints
> = ToSpecificCraftQueryParamsOutputs<
  UnionToTuple<QueryParamKeys>,
  QueryParams,
  PartialContext<{}>,
  StoreConfig
>;

type SpecificCraftQueryStandaloneOutputs<
  QueryParamKeys extends keyof QueryParams,
  QueryParams extends Record<QueryParamKeys, unknown>
> = {
  [K in QueryParamKeys as `set${Capitalize<
    K & string
  >}QueryParam`]: QueryParams[K] extends QueryParamOutput<
    unknown,
    unknown,
    infer QueryParamsState
  >
    ? <
        T extends Partial<{
          [StateKey in keyof QueryParamsState]: QueryParamsState[StateKey];
        }>
      >(
        params: T
      ) => {
        [StateKey in keyof T]: string;
      }
    : never;
};

type CraftQueryParamsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  QueryParamKeys extends keyof QueryParams,
  QueryParams extends Record<QueryParamKeys, unknown>
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftQueryParamsOutputs<QueryParamKeys, QueryParams, StoreConfig>,
  SpecificCraftQueryStandaloneOutputs<QueryParamKeys, QueryParams>
>;

/**
 * Creates a craft factory for managing multiple reactive query parameter groups integrated with the craft store.
 *
 * This function allows you to define multiple named query parameter groups within a single craft store by:
 * - Creating typed signals for each query parameter group prefixed with their respective names
 * - Providing standalone methods to serialize query params for navigation outside injection context
 * - Synchronizing all query parameter groups with URL query parameters automatically
 *
 * @remarks
 * **Important:** The `queryParamFactory` function must return an object where each value is a `queryParam()` call.
 * Since `queryParam()` requires an injection context, `craftQueryParams` handles this by:
 * - Calling the factory within an injection context to create the reactive query param managers
 * - Calling the factory outside injection context to extract configurations for standalone methods
 *
 * **Warning:** Be careful to avoid query params key collisions between different groups. (There is no verification yet)
 *
 * @param queryParamFactory - Factory function that receives craft context and returns an object of QueryParamOutput instances
 * @returns A craft factory function with standalone methods for serializing each query param group
 *
 * @example
 * Basic usage with multiple query param groups
 * ```ts
 * const { injectCraft, setPaginationQueryParam, setActiveQueryParam } = craft(
 *   {
 *     providedIn: 'root',
 *     name: 'myStore',
 *   },
 *   craftQueryParams(() => ({
 *     pagination: queryParam({
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
 *     }, ({ set, reset }) => ({ set, reset })),
 *     active: queryParam({
 *       state: {
 *         isActive: {
 *           fallbackValue: false,
 *           parse: (value: string) => value === 'true',
 *           serialize: (value: unknown) => String(value),
 *         },
 *       },
 *     }, ({ set, reset }) => ({ set, reset })),
 *   }))
 * );
 *
 * // In a component (injection context):
 * const store = injectCraft();
 *
 * // Accessing query param values
 * store.paginationPage();       // Signal<number> for 'page' from pagination group
 * store.paginationPageSize();   // Signal<number> for 'pageSize' from pagination group
 * store.pagination();            // Signal<{ page: number; pageSize: number }>
 * store.activeIsActive();       // Signal<boolean> for 'isActive' from active group
 * store.active();               // Signal<{ isActive: boolean }>
 *
 * // Updating query param values (also updates URL)
 * store.setPagination({ page: 2, pageSize: 20 });
 * store.setActive({ isActive: true });
 * store.resetPagination();
 * store.resetActive();
 * ```
 *
 * @example
 * Using standalone methods for navigation outside injection context
 * ```ts
 * // Outside injection context (e.g., in a route resolver, guard, or service method):
 * async navigateToMyPage() {
 *   await router.navigate(['my-page'], {
 *     queryParams: {
 *       ...setPaginationQueryParam({ page: 4, pageSize: 20 }),
 *       ...setActiveQueryParam({ isActive: true }),
 *     },
 *   });
 * }
 *
 * navigateByUrlToMyPage() {
 *   const paginationParams = setPaginationQueryParam({ page: 4, pageSize: 20 });
 *   const activeParams = setActiveQueryParam({ isActive: true });
 *   router.navigateByUrl(
 *     `/my-page?${paginationParams}&${activeParams}`
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
 *     name: 'myStore',
 *   },
 *   craftQueryParams(() => ({
 *     pagination: queryParam(
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
 *     ),
 *     filters: queryParam({
 *       state: {
 *         search: { fallbackValue: '', parse: String, serialize: String },
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 * store.goToPagePagination(5);     // Custom method from pagination insertion
 * store.filtersSearch();           // Signal<string> for 'search' from filters group
 * ```
 */
export function craftQueryParams<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  QueryParamKeys extends keyof QueryParams,
  QueryParams extends Record<QueryParamKeys, unknown>
>(
  queryParamFactory: (context: CraftFactoryEntries<Context>) => QueryParams
): CraftQueryParamsOutputs<Context, StoreConfig, QueryParamKeys, QueryParams> {
  const context = (
    contextData: ContextInput<Context>,
    injector: Injector,
    _storeConfig: StoreConfig,
    _cloudProxy: Context['_cloudProxy']
  ) => {
    console.log('contextData', contextData);
    const queryParamStates = queryParamFactory(
      craftFactoryEntries(contextData)
    );

    const { props, methods } = Object.entries(queryParamStates).reduce(
      (acc, [key, queryParam]) => {
        const { props, methods } = Object.entries(
          queryParam as QueryParamOutput<unknown, unknown, unknown>
        ).reduce(
          (acc, [queryParamKey, queryParamValue]) => {
            if (isSignal(queryParamValue)) {
              (acc.props as Record<string, Signal<any>>)[
                `${key}${capitalize(queryParamKey)}`
              ] = queryParamValue;
            } else {
              (acc.methods as Record<string, Function>)[
                `${queryParamKey}${capitalize(key)}`
              ] = queryParamValue as Function;
            }
            return acc;
          },
          { props: {}, methods: {} } as {
            props: Record<string, Signal<any>>;
            methods: Record<string, Function>;
          }
        );

        Object.assign(acc.props, props);
        Object.assign(acc.methods, methods);

        return acc;
      },
      { props: {}, methods: {} } as {
        props: Record<string, Signal<any>>;
        methods: Record<string, Function>;
      }
    );

    return partialContext({
      props: { ...props, ...queryParamStates },
      _queryParams: Object.entries(queryParamStates).reduce(
        (acc, [key, queryParam]) => {
          acc[key] = {
            config: queryParam,
            state: queryParam,
          };
          return acc;
        },
        {} as Record<string, { config: unknown; state: unknown }>
      ),
      methods,
    }) as SpecificCraftQueryParamsOutputs<
      QueryParamKeys,
      QueryParams,
      StoreConfig
    >;
  };

  // when queryParam is called outside the injection context, it will only return the config
  const queryParamsConfigs = queryParamFactory({});

  const setQueryParams = Object.entries(queryParamsConfigs).reduce(
    (acc, [key, queryParam]) => {
      const setCurrentQueryParams = (params: Record<string, unknown>) => {
        return serializeQueryParams(
          params,
          (queryParam as QueryParamOutput<unknown, unknown, unknown>)
            ._config as { state: Record<string, QueryParamConfig<unknown>> }
        );
      };
      const setCurrentQueryParamsKey = `set${capitalize(key)}QueryParam`;
      acc[setCurrentQueryParamsKey] = setCurrentQueryParams;
      return acc;
    },
    {} as Record<string, Function>
  );

  return (() =>
    Object.assign(
      context,
      setQueryParams
    )) as unknown as CraftQueryParamsOutputs<
    Context,
    StoreConfig,
    QueryParamKeys,
    QueryParams
  >;
}
