import { WritableSignal } from '@angular/core';
import {
  ContextConstraints,
  EmptyContext,
  CraftFactoryUtility,
  StoreConfigConstraints,
  partialContext,
  CloudProxySource,
} from './craft';
import { Prettify } from './util/util.type';
import { FlatRecord, STORE_CONFIG_TOKEN } from './util/util.type';
import { capitalize } from './util/util';

type InferQueryParamsState<T> = T extends WritableSignal<infer U> ? U : never;

type SpecificCraftSetAllQueriesParamsStandaloneOutputs<
  Context extends ContextConstraints,
> = {
  [K in `setAll${Capitalize<
    (typeof STORE_CONFIG_TOKEN)['NAME']
  >}QueryParams`]: <
    AllQueriesParamsState extends {
      [K in keyof Context['_queryParams']]: 'state' extends keyof Context['_queryParams'][K]
        ? InferQueryParamsState<Context['_queryParams'][K]['state']>
        : 'STORE_CONFIG_ERROR: When using craftSetAllQueriesParamsStandalone, each query param configuration must define a state';
    },
  >(
    params: Prettify<AllQueriesParamsState>,
  ) => {
    [K in keyof FlatRecord<AllQueriesParamsState>]: string;
  };
};

type CraftSetAllQueriesParamsStandaloneOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  EmptyContext,
  SpecificCraftSetAllQueriesParamsStandaloneOutputs<Context>
>;

/**
 * Creates a standalone method to set all query parameters at once for use in Angular Router navigation.
 *
 * This function generates a utility method that:
 * - Collects query parameter state from all registered query params in the store
 * - Serializes all values into URL-compatible strings
 * - Returns a flat object compatible with Angular Router's `queryParams` option
 * - Provides a `toString()` method for use with `navigateByUrl()`
 * - Enables type-safe batch updates of all query parameters
 *
 * @remarks
 * **Use Cases:**
 * - **Programmatic navigation**: Set all query params when navigating to a route
 * - **Link generation**: Create URLs with all current query parameter state
 * - **Deep linking**: Generate shareable URLs with complete state
 * - **Bulk updates**: Update multiple query param groups in one operation
 *
 * **Naming Convention:**
 * - Generated method: `setAll{StoreName}QueryParams`
 * - Example: For store named "MyStore", method is `setAllMyStoreQueryParams`
 *
 * **Router Integration:**
 * - Use with `router.navigate(['/path'], { queryParams: result })`
 * - Use with `router.navigateByUrl(`/path?${result}`)`
 * - Compatible with `routerLink` directive
 *
 * **Type Safety:**
 * - Input is typed based on all registered query param configurations
 * - Output is a flat record of string values ready for the URL
 * - TypeScript ensures all required query param groups are provided
 *
 * **Requirements:**
 * - Must be used after all `craftQueryParam()` definitions in the craft store
 * - Each query param must define a `state` with parse/serialize/fallbackValue
 *
 * @template Context - The craft store context type containing all query param definitions
 * @template StoreConfig - The craft store configuration type with store name
 *
 * @returns A craft factory utility that adds a standalone method:
 *   `setAll{StoreName}QueryParams(params)` - Accepts object with all query param states,
 *   returns flat string record for router + toString() method for URL construction
 *
 * @example
 * Basic usage with router.navigate
 * ```ts
 * const { injectCraft, setAllMyStoreQueryParams } = craft(
 *   { name: 'MyStore', providedIn: 'root' },
 *   craftQueryParam('pagination', () =>
 *     queryParam({
 *       state: {
 *         page: {
 *           fallbackValue: 1,
 *           parse: (v) => parseInt(v, 10),
 *           serialize: (v) => String(v),
 *         },
 *         pageSize: {
 *           fallbackValue: 10,
 *           parse: (v) => parseInt(v, 10),
 *           serialize: (v) => String(v),
 *         },
 *       },
 *     })
 *   ),
 *   craftQueryParam('filter', () =>
 *     queryParam({
 *       state: {
 *         search: {
 *           fallbackValue: '',
 *           parse: (v) => v,
 *           serialize: (v) => v,
 *         },
 *         active: {
 *           fallbackValue: false,
 *           parse: (v) => v === 'true',
 *           serialize: (v) => String(v),
 *         },
 *       },
 *     })
 *   ),
 *   craftSetAllQueriesParamsStandalone()
 * );
 *
 * // In a component
 * const router = inject(Router);
 *
 * function goToPage(page: number) {
 *   router.navigate(['/items'], {
 *     queryParams: setAllMyStoreQueryParams({
 *       pagination: { page, pageSize: 20 },
 *       filter: { search: 'angular', active: true },
 *     }),
 *   });
 *   // URL: /items?page=5&pageSize=20&search=angular&active=true
 * }
 * ```
 *
 * @example
 * Using with navigateByUrl and toString()
 * ```ts
 * const { setAllBlogQueryParams } = craft(
 *   { name: 'Blog', providedIn: 'root' },
 *   craftQueryParam('sorting', () =>
 *     queryParam({
 *       state: {
 *         sortBy: {
 *           fallbackValue: 'date',
 *           parse: (v) => v,
 *           serialize: (v) => v,
 *         },
 *         order: {
 *           fallbackValue: 'desc' as 'asc' | 'desc',
 *           parse: (v) => v as 'asc' | 'desc',
 *           serialize: (v) => v,
 *         },
 *       },
 *     })
 *   ),
 *   craftSetAllQueriesParamsStandalone()
 * );
 *
 * const router = inject(Router);
 *
 * function goToPosts() {
 *   const params = setAllBlogQueryParams({
 *     sorting: { sortBy: 'title', order: 'asc' },
 *   });
 *
 *   // Use toString() for navigateByUrl
 *   router.navigateByUrl(`/posts?${params}`);
 *   // URL: /posts?sortBy=title&order=asc
 * }
 * ```
 *
 * @example
 * Type-safe usage with autocomplete
 * ```ts
 * const { setAllShopQueryParams } = craft(
 *   { name: 'Shop', providedIn: 'root' },
 *   craftQueryParam('filters', () =>
 *     queryParam({
 *       state: {
 *         category: { fallbackValue: 'all', parse: String, serialize: String },
 *         minPrice: { fallbackValue: 0, parse: Number, serialize: String },
 *         maxPrice: { fallbackValue: 1000, parse: Number, serialize: String },
 *       },
 *     })
 *   ),
 *   craftQueryParam('view', () =>
 *     queryParam({
 *       state: {
 *         layout: { fallbackValue: 'grid', parse: String, serialize: String },
 *       },
 *     })
 *   ),
 *   craftSetAllQueriesParamsStandalone()
 * );
 *
 * // TypeScript enforces providing all query param groups
 * const queryParams = setAllShopQueryParams({
 *   filters: { category: 'electronics', minPrice: 100, maxPrice: 500 },
 *   view: { layout: 'list' },
 * });
 * // ✓ Type-safe: all required groups provided
 *
 * // TypeScript error if missing a group:
 * // const incomplete = setAllShopQueryParams({
 * //   filters: { category: 'electronics', minPrice: 100, maxPrice: 500 },
 * //   // Error: Property 'view' is missing
 * // });
 * ```
 *
 * @example
 * Generating shareable links
 * ```ts
 * const { injectCraft, setAllArticleQueryParams } = craft(
 *   { name: 'Article', providedIn: 'root' },
 *   craftQueryParam('reader', () =>
 *     queryParam({
 *       state: {
 *         fontSize: { fallbackValue: 16, parse: Number, serialize: String },
 *         theme: { fallbackValue: 'light', parse: String, serialize: String },
 *       },
 *     })
 *   ),
 *   craftSetAllQueriesParamsStandalone()
 * );
 *
 * const store = injectCraft();
 *
 * function getShareableLink(): string {
 *   const params = setAllArticleQueryParams({
 *     reader: {
 *       fontSize: store.readerFontSize(),
 *       theme: store.readerTheme(),
 *     },
 *   });
 *
 *   return `${window.location.origin}/article/123?${params}`;
 *   // Returns: https://example.com/article/123?fontSize=18&theme=dark
 * }
 * ```
 *
 * @example
 * Conditional query param values
 * ```ts
 * const { setAllSearchQueryParams } = craft(
 *   { name: 'Search', providedIn: 'root' },
 *   craftQueryParam('query', () =>
 *     queryParam({
 *       state: {
 *         q: { fallbackValue: '', parse: String, serialize: String },
 *         page: { fallbackValue: 1, parse: Number, serialize: String },
 *       },
 *     })
 *   ),
 *   craftQueryParam('advanced', () =>
 *     queryParam({
 *       state: {
 *         dateFrom: { fallbackValue: '', parse: String, serialize: String },
 *         dateTo: { fallbackValue: '', parse: String, serialize: String },
 *       },
 *     })
 *   ),
 *   craftSetAllQueriesParamsStandalone()
 * );
 *
 * function searchWithFilters(searchTerm: string, useAdvanced: boolean) {
 *   const router = inject(Router);
 *
 *   router.navigate(['/search'], {
 *     queryParams: setAllSearchQueryParams({
 *       query: { q: searchTerm, page: 1 },
 *       advanced: useAdvanced
 *         ? { dateFrom: '2024-01-01', dateTo: '2024-12-31' }
 *         : { dateFrom: '', dateTo: '' }, // Use fallback values
 *     }),
 *   });
 * }
 * ```
 *
 * @example
 * Integration with routerLink directive
 * ```ts
 * // In component class
 * const { setAllProductQueryParams } = craft(
 *   { name: 'Product', providedIn: 'root' },
 *   craftQueryParam('display', () =>
 *     queryParam({
 *       state: {
 *         view: { fallbackValue: 'grid', parse: String, serialize: String },
 *         perPage: { fallbackValue: 12, parse: Number, serialize: String },
 *       },
 *     })
 *   ),
 *   craftSetAllQueriesParamsStandalone()
 * );
 *
 * // Generate query params for template
 * listViewParams = setAllProductQueryParams({
 *   display: { view: 'list', perPage: 24 },
 * });
 *
 * gridViewParams = setAllProductQueryParams({
 *   display: { view: 'grid', perPage: 12 },
 * });
 *
 * // In template
 * // <a [routerLink]="['/products']" [queryParams]="listViewParams">List View</a>
 * // <a [routerLink]="['/products']" [queryParams]="gridViewParams">Grid View</a>
 * ```
 */
export function craftSetAllQueriesParamsStandalone<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
>(): CraftSetAllQueriesParamsStandaloneOutputs<Context, StoreConfig> {
  return (_cloudProxy: CloudProxySource, storeConfig) => {
    return Object.assign(() => partialContext({}), {
      [`setAll${capitalize(storeConfig.name)}QueryParams`]: (allQueryParams: {
        [queryParamsName: string]: unknown;
      }) => {
        const { flatParams, queryStringParts } = Object.entries(
          allQueryParams,
        ).reduce(
          (acc, [queryParamsName, params]) => {
            console.log(`Setting query params for ${queryParamsName}:`, params);
            const queryParams = (
              _cloudProxy[
                `set${capitalize(queryParamsName)}QueryParams`
              ] as Function
            )(params as Record<string, unknown>);
            Object.entries(queryParams).forEach(([key, value]) => {
              acc.flatParams[key] = value;
            });
            // Keep the string representation for later
            acc.queryStringParts.push(
              // If queryParams is already something like URLSearchParams-like:
              queryParams.toString(),
            );

            return acc;
          },
          {
            flatParams: {} as Record<string, unknown>,
            queryStringParts: [] as string[],
          },
        );

        // Define toString only once, after the reduce
        const result = Object.defineProperty(flatParams, 'toString', {
          value() {
            // Join all partial query strings with "&"
            return queryStringParts
              .filter((part) => part && part.length > 0)
              .join('&');
          },
          enumerable: false,
          configurable: true,
          writable: true,
        });

        return result;
      },
    });
  };
}
