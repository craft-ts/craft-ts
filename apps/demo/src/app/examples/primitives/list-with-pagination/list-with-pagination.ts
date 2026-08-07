import styles from './list-with-pagination.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  h,
  h2,
  ifBlock,
  option,
  select,
  span,
} from '@craft-ng/component';
import {
  craftComputed,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  query,
  queryParams,
  toCraftStatus,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const ListWithPagination = craftComponent(
  'ListWithPagination',
  {
    stylesUrl: styles,
  },
  function* () {
    const pagination = yield* queryParams(
      'pagination',
      {
        state: {
          page: {
            fallbackValue: 1,
            codec: {
              decode: (value: string) => Number(value),
              encode: (value: number) => String(value),
            },
          },
          pageSize: {
            fallbackValue: 4,
            codec: {
              decode: (value: string) => Number(value),
              encode: (value: number) => String(value),
            },
          },
        },
      },
      ({ patch, state }) => ({
        nextPage: () => patch({ page: state().page + 1 }),
        previousPage: () => patch({ page: state().page - 1 }),
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
            key: 'list-with-pagination',
          }),
          insertPaginationPlaceholderData({ initialValue: [] as User[] }),
        ),
    );
    const isCurrentPageResolved = craftComputed(
      'isCurrentPageResolved',
      () => usersQuery.currentPageStatus() === 'resolved',
    );
    return { pagination, usersQuery, isCurrentPageResolved };
  },
  ({ pagination, usersQuery, isCurrentPageResolved }) => {
    return div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => toCraftStatus(usersQuery.currentPageStatus(), false),
        }),
      ]),
      h(
        'table',
        { class: 'table' },
        h(
          'tbody',
          each(
            usersQuery.currentPageData,
            {
              track: (user) => user.id,
              empty: () =>
                h(
                  'tr',
                  h(
                    'td',
                    ifBlock(
                      isCurrentPageResolved,
                      () => 'No users found',
                      () => 'Loading…',
                    ),
                  ),
                ),
            },
            (user) => h('tr', [h('td', String(user.id)), h('td', user.name)]),
          ),
        ),
      ),
      div({ class: 'pagination' }, [
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
        span({ class: 'current-page' }, String(pagination().page)),
        button({ click: pagination.nextPage }, 'Next'),
      ]),
    ]);
  },
);

export default ListWithPagination;
