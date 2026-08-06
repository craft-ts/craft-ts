import { computed } from '@angular/core';
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
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  query,
  queryParams,
  toCraftStatus,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const { provideUserList, UserList } = craftService(
  { name: 'UserList', scope: 'toProvide' },
  function* () {
    const { pagination } = yield* queryParams(
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
    const { users } = yield* query(
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
    providers: [
      provideUserList(),
    ],
  },
  function* () {
    const store = yield* UserList();
    const { updatePageSize } = craftMethod(
      'updatePageSize',
      function* (event: Event) {
        (yield* UserList()).pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        );
      },
    );
    return { store, updatePageSize };
  },
  ({ store, updatePageSize }) =>
    div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => toCraftStatus(store.users.currentPageStatus(), false),
        }),
        span(` ${store.users.total()} on page`),
      ]),
      h('table', [
        h('thead', h('tr', [h('th', 'ID'), h('th', 'Name')])),
        h(
          'tbody',
          each(
            () => store.users.currentPageData() ?? [],
            {
              track: (user) => user.id,
              empty: () =>
                h(
                  'tr',
                  h(
                    'td',
                    { colSpan: 2 },
                    store.users.currentPageStatus() === 'resolved'
                      ? 'No users found'
                      : 'Loading…',
                  ),
                ),
            },
            (user) => h('tr', [h('td', String(user.id)), h('td', user.name)]),
          ),
        ),
      ]),
      div([
        select(
          {
            value: String(store.pagination().pageSize),
            change: (event) => void updatePageSize(event),
          },
          [2, 4, 8, 16].map((size) =>
            option({ value: String(size) }, String(size)),
          ),
        ),
        button({ click: store.pagination.previousPage }, 'Previous'),
        span(String(store.pagination().page)),
        button({ click: store.pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default ListWithPaginationCraft;
