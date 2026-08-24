/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './list-with-pagination.css' with { loader: 'text' };
import {
  button,
  ifBlock,
  craftComponent,
  div,
  each,
  main,
  option,
  select,
  pendingBlock,
  span,
  table,
  thead,
  th,
  td,
  heading,
  tr,
  tbody,
} from '@craft-ts/component';
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
} from '@craft-ts/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

export const { provideUserList, UserList } = craftService(
  { name: 'UserList', providedIn: 'toProvide' },
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
            heading({ class: 'card-title' }, [
              'User Management: ',
              // `currentPageStatus` is a settled read: it suspends whenever the
              // page on screen has no value of its own. Its own boundary keeps
              // the suspension off the rows, which the placeholder insertion
              // keeps showing across a page change.
              span({}, [
                StatusComponent({
                  status: store.users.currentPageStatus,
                }),
              ]).pipe(pendingBlock({ fallback: () => span({}, '⏳') })),
              span(
                'TotalUsers',
                { class: 'current-page' },
                function* () {
                  return ` ${yield* store.users.total()} on page`;
                },
              ),
            ]),
            // Only reached on the very first load: once a page has been
            // shown, the placeholder keeps `currentPageData` non-empty, so the
            // empty slot — and the settled read inside it — never runs again.
            div({ class: 'table-container' }, [
              table( { class: 'table' }, [
                thead( tr( [th( 'ID'), th( 'Name')])),
                tbody(
                  each(
                    store.users.currentPageData,
                    {
                      track: (user) => user.id,
                      empty: () =>
                        tr(
                          td(
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
                      tr( [
                        td( function* () {
                          return (yield* user()).id;
                        }),
                        td( function* () {
                          return (yield* user()).name;
                        }),
                      ]),
                  ),
                ),
              ]),
            ]).pipe(pendingBlock({ fallback: () => div('⏳ Loading users…') })),
            div({ class: 'pagination' }, [
              select(
                'PageSize',
                {
                  'aria-label': 'Page size',
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
                { type: 'button', class: 'btn', click: store.pagination.previousPage },
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
                { type: 'button', class: 'btn', click: store.pagination.nextPage },
                'Next',
              ),
            ]),
          ]),
        ]),
      ]),
    ]),
);

export default ListWithPaginationCraft;
