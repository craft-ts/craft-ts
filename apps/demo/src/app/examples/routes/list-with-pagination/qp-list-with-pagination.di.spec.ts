import { describe, expectTypeOf, it } from 'vitest';
import {
  CRAFT_SERVICE_PROVIDER_BRAND,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';
import type { AppProvidedNames, AppProvidedValues } from '../../../app.config';
import type { demoRoutes } from '../../../app.routes';
import type QpListWithPagination from './qp-list-with-pagination';

type ComponentDeps = ComponentDepsOf<typeof QpListWithPagination>;
type AppAndRouterProviders =
  | AppProvidedNames
  | 'CraftRouter'
  | 'CraftActivatedRoute';
type QueryParamsRoute = Extract<
  (typeof demoRoutes)['_routes'][number],
  { path: 'query-params' }
>;
type QueryParamsRouteProvidersFn = QueryParamsRoute extends {
  providersFn: infer Factory;
}
  ? Factory
  : never;
type QueryParamsRouteProviders = QueryParamsRouteProvidersFn extends (
  ...args: never[]
) => infer Providers
  ? Providers
  : never;
type QueryParamsRouteProviderNames = QueryParamsRouteProviders extends readonly (
  infer Provider
)[]
  ? Provider extends {
      readonly [CRAFT_SERVICE_PROVIDER_BRAND]?: { name: infer Name extends string };
    }
    ? Name
    : never
  : never;

describe('query params route DI', () => {
  it('requires the route-scoped provider used by the pagination component', () => {
    type WithoutRouteProvider = RouteCheckedDI<
      ComponentDeps,
      AppAndRouterProviders,
      AppProvidedValues,
      'path: "query-params"'
    >;
    type WithRouteProvider = RouteCheckedDI<
      ComponentDeps,
      AppAndRouterProviders | QueryParamsRouteProviderNames,
      AppProvidedValues,
      'path: "query-params"'
    >;

    expectTypeOf<QueryParamsRouteProviderNames>().toEqualTypeOf<
      'RoutePaginationQueryParams'
    >();
    expectTypeOf<WithoutRouteProvider>().toEqualTypeOf<
      [
        'The RoutePaginationQueryParams service is not provided in path: "query-params"',
      ]
    >();
    expectTypeOf<WithRouteProvider>().toEqualTypeOf<true>();
  });
});
