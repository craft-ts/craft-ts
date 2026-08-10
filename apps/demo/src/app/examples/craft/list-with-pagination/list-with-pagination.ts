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
  main,
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

export const { provideUserList, UserList } = craftService(
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
    div({ class: 'container' }, [
      main({ class: 'content' }, [
        div({ class: 'content-wrapper' }, [
          div({ class: 'card' }, [
            h2({ class: 'card-title' }, [
              'User Management: ',
              StatusComponent({
                status: () => store.users.currentPageStatus(),
              }),
              span(
                'TotalUsers',
                { class: 'current-page' },
                () => ` ${store.users.total()} on page`,
              ),
            ]),
            div({ class: 'table-container' }, [
              h('table', { class: 'table' }, [
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
                            {
                              colSpan: 2,
                              style: {
                                textAlign: 'center',
                                padding: '32px',
                              },
                            },
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
            ]),
            div({ class: 'pagination' }, [
              select(
                'PageSize',
                {
                  value: () => String(store.pagination().pageSize),
                  style: { marginRight: '8px' },
                  *change(event) {
                    yield* updatePageSize(event);
                  },
                },
                [2, 4, 8, 16].map((size) =>
                  option(
                    {
                      value: String(size),
                      selected: () => size === store.pagination().pageSize,
                    },
                    size,
                  ),
                ),
              ),
              button(
                'PreviousPage',
                { class: 'btn', click: store.pagination.previousPage },
                'Previous',
              ),
              span(
                'CurrentPage',
                { class: 'current-page' },
                () => store.pagination().page,
              ),
              button(
                'NextPage',
                { class: 'btn', click: store.pagination.nextPage },
                'Next',
              ),
            ]),
          ]),
        ]),
      ]),
    ]),
);

export default ListWithPaginationCraft;
