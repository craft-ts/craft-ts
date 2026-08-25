/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  forNode,
  option,
  pendingNode,
  select,
  span,
  heading,
  td,
  tr,
  table,
  tbody,
} from '@craft-ts/component';
import {
  craftMethod,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  insertStoragePersister,
  craftUnique,
  query,
  queryParams,
} from '@craft-ts/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import styles from './list-with-pagination.css' with { loader: 'text' };

const QpListWithPagination = craftComponent(
  'QpListWithPagination',
  {
    stylesUrl: styles,
  },
  function* () {
    const pagination = yield* queryParams(
      'pagination',
      paginationQueryParams(),
      ({ patch, state }) => ({
        nextPage: function* () {
          const _state = yield* state();
          return yield* patch({ page: _state.page + 1 });
        },
        previousPage: function* () {
          const _state = yield* state();
          return yield* patch({ page: Math.max(1, _state.page - 1) });
        },
        updatePageSize: function* (pageSize: number) {
          return yield* patch({ pageSize, page: 1 });
        },
      }),
    );
    const api = yield* ApiService();
    const usersQuery = yield* query(
      'usersQuery',
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: function* ({ params }) {
          return yield* api.getDataList(params);
        },
      },
      insertQueryPipe(
        insertStoragePersister(craftUnique({
          storeName: 'demo-app',
          key: 'route-list-with-pagination',
        })),
        insertPaginationPlaceholderData({ initialValue: [] as User[] }),
      ),
    );
    const updatePageSize = craftMethod(
      'updatePageSize',
      function* (event: Event) {
        yield* pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        );
      },
    );
    return { pagination, usersQuery, updatePageSize };
  },
  ({ pagination, updatePageSize, usersQuery }) =>
    div([
      heading([
        'Route QueryParams pagination: ',
        StatusComponent({
          status: usersQuery.currentPageStatus,
        }),
      ]).pipe(
        pendingNode({
          fallback: () => heading('Route QueryParams pagination: Loading…'),
        }),
      ),
      table(
        { class: 'table' },
        tbody(
          forNode(
            usersQuery.currentPageData,
            { track: (user) => user.id },
                    (user) =>
                      tr( [
                        td( function* () {
                          return (yield* user()).id;
                        }),
                        td( function* () {
                          return (yield* user()).name;
                        }),
                      ]),
          ),
        ),
      ),
      div({ class: 'pagination' }, [
        select('pageSize',
          {
            'aria-label': 'Page size',
            value: pagination.pageSize,
            change: updatePageSize,
          },
          [2, 4, 8, 16].map((size) => option({ value: size }, size)),
        ),
        button('previousPage', { type: 'button', click: pagination.previousPage }, 'Previous'),
        span({ class: 'current-page' }, pagination.page),
        button('nextPage', { type: 'button', click: pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default QpListWithPagination;
