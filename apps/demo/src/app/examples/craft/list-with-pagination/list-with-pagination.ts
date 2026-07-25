import { computed } from '@angular/core';
import {
  button,
  component,
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
  craftMethod,
  craftPipe,
  craftService,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  provideHostName,
  query,
  queryParams,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';

const { provideUserList, UserListToYield } = craftService(
  { name: 'UserList', scope: 'toProvide' },
  function* () {
    const pagination = yield* queryParams(
      {
        state: {
          page: {
            fallbackValue: 1,
            parse: (value) => Number(value),
            serialize: String,
          },
          pageSize: {
            fallbackValue: 4,
            parse: (value) => Number(value),
            serialize: String,
          },
        },
      },
      ({ patch, state }) => ({
        nextPage: () => patch({ page: state().page + 1 }),
        previousPage: () => patch({ page: state().page - 1 }),
        updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
      }),
    );
    const users = yield* query(
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: function* ({ params }) {
          return yield* ApiServiceToYield.getDataList(params);
        },
      },
      (context) =>
        craftPipe(
          context,
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

const ListWithPaginationCraft = component(
  {
    providers: [
      provideUserList(),
      provideHostName('component:ListWithPaginationCraft'),
    ],
  },
  function* () {
    componentMonitoring();
    const store = yield* UserListToYield();
    const updatePageSize = craftMethod(
      'updatePageSize',
      function* (event: Event) {
        (yield* UserListToYield()).pagination.updatePageSize(
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
          status: () => store.users.currentPageStatus(),
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
