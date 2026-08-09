import styles from './list-with-pagination.css' with { loader: 'text' };
import { computed } from '@angular/core';
import {
  button,
  ifBlock,
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
  craftComputed,
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  query,
  queryParams,
} from '@craft-ng/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const { provideUserList, UserList } = craftService(
  { name: 'UserList', scope: 'toProvide' },
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
    const users = yield* query(
      'users',
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: function* ({ params }) {
          return yield* ApiService.getDataList(params);
        },
      },
      insertQueryPipe(
        insertLocalStoragePersister({
          storeName: 'demo-app-craft',
          key: 'list-with-pagination',
        }),
        insertPaginationPlaceholderData(
          { initialValue: [] as User[] },
          ({ state }) => ({
            total: computed(() => state().length),
          }),
        ),
      ),
    );
    return { pagination, users };
  },
);

const ListWithPaginationCraft = craftComponent(
  'ListWithPaginationCraft',
  {
    stylesUrl: styles,
    providers: [provideUserList()],
  },
  function* () {
    const store = yield* UserList();
    const isCurrentPageResolved = craftComputed(
      'isCurrentPageResolved',
      () => store.users.currentPageStatus() === 'resolved',
    );
    const updatePageSize = craftMethod(
      'updatePageSize',
      function* (event: Event) {
        (yield* UserList()).pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        );
      },
    );
    return { store, updatePageSize, isCurrentPageResolved };
  },
  ({ store, updatePageSize, isCurrentPageResolved }) =>
    div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => store.users.currentPageStatus(),
        }),
        span(` ${store.users.total()} on page`),
      ]),
      h('table', [
        h('thead', h('tr', [h('th', 'ID'), h('th', 'Name')])),
        h(
          'tbody',
          each(
            store.users.currentPageData,
            {
              track: (user) => user.id,
              empty: () =>
                h(
                  'tr',
                  h(
                    'td',
                    { colSpan: 2 },
                    ifBlock(
                      isCurrentPageResolved,
                      () => 'No users found',
                      () => 'Loading…',
                    ),
                  ),
                ),
            },
            (user) => h('tr', [h('td', user.id), h('td', user.name)]),
          ),
        ),
      ]),
      div([
        select(
          {
            value: store.pagination().pageSize,
            *change(event) {
              yield* updatePageSize(event);
            },
          },
          [2, 4, 8, 16].map((size) => option({ value: size }, size)),
        ),
        button({ click: store.pagination.previousPage }, 'Previous'),
        span(store.pagination().page),
        button({ click: store.pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default ListWithPaginationCraft;
