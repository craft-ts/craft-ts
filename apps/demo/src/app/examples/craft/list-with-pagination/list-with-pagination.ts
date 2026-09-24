import {
  button,
  ifNode,
  craftComponent,
  div,
  forNode,
  main,
  option,
  select,
  pendingNode,
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
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';

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
          { initialValue: Array<User>() },
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
          Number(eventValue(event)),
        );
      },
    );
    return { store, updatePageSize, isCurrentPageResolved };
  },
  ({ store, updatePageSize, isCurrentPageResolved }) =>
    div({ class: example.page }, [
      main([
        div([
          div({ class: example.panel }, [
            heading({ class: example.title }, [
              'User Management: ',
              // `currentPageStatus` is a settled read: it suspends whenever the
              // page on screen has no value of its own. Its own boundary keeps
              // the suspension off the rows, which the placeholder insertion
              // keeps showing across a page change.
              span({}, [
                StatusComponent({
                  status: store.users.currentPageStatus,
                }),
              ]).pipe(pendingNode({ fallback: () => span({}, '⏳') })),
              span(
                'TotalUsers',
                { class: example.currentPage, 'data-testid': 'current-page' },
                function* () {
                  return ` ${yield* store.users.total()} on page`;
                },
              ),
            ]),
            // Only reached on the very first load: once a page has been
            // shown, the placeholder keeps `currentPageData` non-empty, so the
            // empty slot — and the settled read inside it — never runs again.
            div([
              table({ class: example.table }, [
                thead( tr({ class: example.tableRow }, [th({ class: example.th }, 'ID'), th({ class: example.th }, 'Name')])),
                tbody(
                  forNode(
                    store.users.currentPageData,
                    {
                      track: (user) => user.id,
                      empty: () =>
                        tr(
                          td(
                            {
                              colSpan: 2,
                              class: example.emptyCell,
                            },
                            ifNode(
                              isCurrentPageResolved,
                              () => 'No users found',
                              () => 'Loading…',
                            ),
                          ),
                        ),
                    },
                    (user) =>
                      tr({ class: example.tableRow }, [
                        td({ class: example.td }, function* () {
                          return (yield* user()).id;
                        }),
                        td({ class: example.td }, function* () {
                          return (yield* user()).name;
                        }),
                      ]),
                  ),
                ),
              ]),
            ]).pipe(pendingNode({ fallback: () => div('⏳ Loading users…') })),
            div({ class: example.pagination, 'data-testid': 'pagination' }, [
              select(
                'PageSize',
                {
                  class: example.select,
                  'aria-label': 'Page size',
                  value: function* () {
                    return String((yield* store.pagination()).pageSize);
                  },
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
                { type: 'button', class: example.button, click: store.pagination.previousPage },
                'Previous',
              ),
              span(
                'CurrentPage',
                { class: example.currentPage, 'data-testid': 'current-page' },
                function* () {
                  return (yield* store.pagination()).page;
                },
              ),
              button(
                'NextPage',
                { type: 'button', class: example.button, click: store.pagination.nextPage },
                'Next',
              ),
            ]),
          ]),
        ]),
      ]),
    ]),
);

export default ListWithPaginationCraft;
