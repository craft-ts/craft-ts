import { craftService, queryParams } from '@craft-ts/core';
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

export const { RoutePaginationQueryParams, provideRoutePaginationQueryParams } =
  craftService(
    { name: 'RoutePaginationQueryParams', providedIn: 'toProvide' },
    function* () {
      return yield* routePaginationQueryParams();
    },
  );
