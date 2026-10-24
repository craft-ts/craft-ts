import { abstract, craftService, queryParams } from '@craft-ts/core';
import { paginationQueryParams } from '../../../query-params.utils';

export const routePaginationQueryParams = function* () {
  return yield* queryParams(
    'pagination',
    paginationQueryParams(),
    ({ patch, state }) => ({
      nextPage: function* () {
        const current = yield* state();
        return yield* patch({ page: current.page + 1 });
      },
      previousPage: function* () {
        const current = yield* state();
        return yield* patch({ page: Math.max(1, current.page - 1) });
      },
      updatePageSize: function* (pageSize: number) {
        return yield* patch({ pageSize, page: 1 });
      },
    }),
  );
};

type RoutePaginationQueryParamsRef = ReturnType<
  typeof routePaginationQueryParams
> extends Generator<infer _Yielded, infer Ref, infer _Next>
  ? Ref
  : never;

export const { RoutePaginationQueryParams, provideRoutePaginationQueryParams } =
  craftService(
    { name: 'RoutePaginationQueryParams', providedIn: 'abstract' },
    abstract<RoutePaginationQueryParamsRef>(),
  );
