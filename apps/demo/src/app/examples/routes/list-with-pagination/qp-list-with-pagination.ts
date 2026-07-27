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
  componentMonitoring,
  craftPipe,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  provideHostName,
  query,
  queryParams,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const QpListWithPagination = craftComponent(
  'QpListWithPagination',
  { providers: [provideHostName('component:QpListWithPagination')] },
  function* () {
    componentMonitoring();
    const { pagination } = yield* queryParams(
      'pagination',
      {
        state: {
          page: { fallbackValue: 1, parse: Number, serialize: String },
          pageSize: { fallbackValue: 4, parse: Number, serialize: String },
        },
      },
      ({ patch, state }) => ({
        nextPage: () => patch({ page: state().page + 1 }),
        previousPage: () => patch({ page: state().page - 1 }),
        updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
      }),
    );
    const api = yield* ApiService();
    const { usersQuery } = yield* query(
      'usersQuery',
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: ({ params }) => api.getDataList(params),
      },
      (context) =>
        craftPipe(
          context,
          insertLocalStoragePersister({
            storeName: 'demo-app',
            key: 'route-list-with-pagination',
          }),
          insertPaginationPlaceholderData({ initialValue: [] as User[] }),
        ),
    );
    return { pagination, usersQuery };
  },
  ({ pagination, usersQuery }) =>
    div([
      h2([
        'Route QueryParams pagination: ',
        StatusComponent({
          status: () => usersQuery.currentPageStatus(),
        }),
      ]),
      h(
        'table',
        h(
          'tbody',
          each(
            () => usersQuery.currentPageData() ?? [],
            { track: (user) => user.id },
            (user) => h('tr', [h('td', String(user.id)), h('td', user.name)]),
          ),
        ),
      ),
      div([
        select(
          {
            value: String(pagination().pageSize),
            change: (event) =>
              pagination.updatePageSize(
                Number((event.target as HTMLSelectElement).value),
              ),
          },
          [2, 4, 8, 16].map((size) =>
            option({ value: String(size) }, String(size)),
          ),
        ),
        button({ click: pagination.previousPage }, 'Previous'),
        span(String(pagination().page)),
        button({ click: pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default QpListWithPagination;
