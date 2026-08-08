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
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  query,
  queryParams,
  toCraftStatus,
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
        nextPage: () => patch({ page: state().page + 1 }),
        previousPage: () => patch({ page: Math.max(1, state().page - 1) }),
        updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
      }),
    );
    const api = yield* ApiService();
    const usersQuery = yield* query(
      'usersQuery',
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: ({ params }) => api.getDataList(params),
      },
      insertQueryPipe(
          insertLocalStoragePersister({
            storeName: 'demo-app',
            key: 'route-list-with-pagination',
          }),
          insertPaginationPlaceholderData({ initialValue: [] as User[] }),
        ),
    );
    const updatePageSize = (event: Event) =>
      pagination.updatePageSize(
        Number((event.target as HTMLSelectElement).value),
      );
    return { pagination, usersQuery, updatePageSize };
  },
  ({ pagination, updatePageSize, usersQuery }) =>
    div([
      h2([
        'Route QueryParams pagination: ',
        StatusComponent({
          status: () => toCraftStatus(usersQuery.currentPageStatus(), false),
        }),
      ]),
      h(
        'table',
        h(
          'tbody',
          each(
            usersQuery.currentPageData,
            { track: (user) => user.id },
            (user) => h('tr', [h('td', user.id), h('td', user.name)]),
          ),
        ),
      ),
      div([
        select(
          {
            value: pagination().pageSize,
            change: updatePageSize,
          },
          [2, 4, 8, 16].map((size) =>
            option({ value: size }, size),
          ),
        ),
        button({ click: pagination.previousPage }, 'Previous'),
        span(pagination().page),
        button({ click: pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default QpListWithPagination;
