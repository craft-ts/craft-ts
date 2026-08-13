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
  insertStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  craftMethod,
  query,
  queryParams,
  craftUse,
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
        nextPage: function* () {
          const _state = yield* state();
          return patch({ page: _state.page + 1 });
        },
        previousPage: function* () {
          const _state = yield* state();
          return patch({ page: Math.max(1, _state.page - 1) });
        },
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
        insertStoragePersister({
          storeName: 'demo-app',
          key: 'list-with-pagination',
        }),
        insertPaginationPlaceholderData(
          { initialValue: [] as User[] },
          ({ currentPageStatus }) => ({
            isCurrentPageResolved: computed(
              () => craftUse(currentPageStatus()) === 'resolved',
            ),
          }),
        ),
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
  ({ pagination, usersQuery, updatePageSize }) => {
    return div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => craftUse(usersQuery.currentPageStatus()),
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
            value: () => String(craftUse(pagination()).pageSize),
            change: updatePageSize,
          },
          [2, 4, 8, 16].map((size) =>
            option(
              {
                value: String(size),
                selected: () => size === craftUse(pagination()).pageSize,
              },
              size,
            ),
          ),
        ),
        button('PreviousPage', { click: pagination.previousPage }, 'Previous'),
        span(
          'CurrentPage',
          { class: 'current-page' },
          () => craftUse(pagination()).page,
        ),
        button('NextPage', { click: pagination.nextPage }, 'Next'),
      ]),
    ]);
  },
);

export default ListWithPagination;
