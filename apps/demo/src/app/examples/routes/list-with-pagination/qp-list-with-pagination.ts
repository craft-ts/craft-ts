import styles from './list-with-pagination.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  h,
  h2,
  option,
  select,
  span,
} from '@craft-ng/component';
import {
  insertStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  craftMethod,
  query,
  queryParams,
} from '@craft-ng/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

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
        updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
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
        insertStoragePersister({
          storeName: 'demo-app',
          key: 'route-list-with-pagination',
        }),
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
      h2([
        'Route QueryParams pagination: ',
        StatusComponent({
          status: usersQuery.currentPageStatus,
        }),
      ]),
      h(
        'table',
        { class: 'table' },
        h(
          'tbody',
          each(
            usersQuery.currentPageData,
            { track: (user) => user.id },
            (user) => h('tr', [h('td', user.id), h('td', user.name)]),
          ),
        ),
      ),
      div({ class: 'pagination' }, [
        select(
          {
            value: pagination.pageSize,
            change: updatePageSize,
          },
          [2, 4, 8, 16].map((size) => option({ value: size }, size)),
        ),
        button({ click: pagination.previousPage }, 'Previous'),
        span({ class: 'current-page' }, pagination.page),
        button({ click: pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default QpListWithPagination;
