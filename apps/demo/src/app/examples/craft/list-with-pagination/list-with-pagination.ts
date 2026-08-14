/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './list-with-pagination.css' with { loader: 'text' };
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
  insertStoragePersister,
  craftUnique,
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
        nextPage: function* () {
          const current = yield* state();
          return yield* patch({ page: current.page + 1 });
        },
        previousPage: function* () {
          const current = yield* state();
          return yield* patch({ page: Math.max(1, current.page - 1) });
        },
        updatePageSize: function* (pageSize: number) {
          return yield* patch({ pageSize, page: 1 });
        },
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
        insertStoragePersister(craftUnique({
          storeName: 'demo-app-craft',
          key: 'list-with-pagination',
        })),
        insertPaginationPlaceholderData(
          { initialValue: [] as User[] },
          ({ state }) => ({
            total: craftComputed('total', function* () {
              return (yield* state()).length;
            }),
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
      function* () {
          const _storeuserscurrentPageStatus = yield* store.users.currentPageStatus(); return _storeuserscurrentPageStatus === 'resolved'; },
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
                status: store.users.currentPageStatus,
              }),
              span(
                'TotalUsers',
                { class: 'current-page' },
                function* () {
                  return ` ${yield* store.users.total()} on page`;
                },
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
                    (user) =>
                      h('tr', [
                        h('td', function* () {
                          return (yield* user()).id;
                        }),
                        h('td', function* () {
                          return (yield* user()).name;
                        }),
                      ]),
                  ),
                ),
              ]),
            ]),
            div({ class: 'pagination' }, [
              select(
                'PageSize',
                {
                  value: function* () {
                    return String((yield* store.pagination()).pageSize);
                  },
                  style: { marginRight: '8px' },
                  *change(event) {
                    yield* updatePageSize(event);
                  },
                },
                [2, 4, 8, 16].map((size) =>
                  option(
                    {
                      value: String(size),
                      selected: function* () {
                        return size === (yield* store.pagination()).pageSize;
                      },
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
                function* () {
                  return (yield* store.pagination()).page;
                },
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
