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
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  query,
  queryParams,
} from '@craft-ng/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { computed } from '@angular/core';

const ListWithPagination = craftComponent(
  'ListWithPagination',
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
    const usersQuery = yield* query(
      'usersQuery',
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: function* ({ params }) {
          return yield* ApiService.getDataList(params);
        },
      },
      insertQueryPipe(
        insertLocalStoragePersister({
          storeName: 'demo-app',
          key: 'list-with-pagination',
        }),
        insertPaginationPlaceholderData(
          { initialValue: [] as User[] },
          ({ currentPageStatus }) => ({
            isCurrentPageResolved: computed(
              () => currentPageStatus() === 'resolved',
            ),
          }),
        ),
      ),
    );

    const updatePageSize = (event: Event) =>
      pagination.updatePageSize(
        Number((event.target as HTMLSelectElement).value),
      );
    return { pagination, usersQuery, updatePageSize };
  },
  ({ pagination, usersQuery, updatePageSize }) => {
    return div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => usersQuery.currentPageStatus(),
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
                      usersQuery.isCurrentPageResolved,
                      () => 'No users found',
                      () => 'Loading…',
                    ),
                  ),
                ),
            },
            (user) => h('tr', [h('td', user.id), h('td', user.name)]),
          ),
        ),
      ),
      div({ class: 'pagination' }, [
        select(
          'PageSize',
          {
            value: String(pagination().pageSize),
            change: updatePageSize,
          },
          [2, 4, 8, 16].map((size) =>
            option(
              {
                value: String(size),
                selected: size === pagination().pageSize,
              },
              size,
            ),
          ),
        ),
        button('PreviousPage', { click: pagination.previousPage }, 'Previous'),
        span('CurrentPage', { class: 'current-page' }, pagination().page),
        button('NextPage', { click: pagination.nextPage }, 'Next'),
      ]),
    ]);
  },
);

export default ListWithPagination;
