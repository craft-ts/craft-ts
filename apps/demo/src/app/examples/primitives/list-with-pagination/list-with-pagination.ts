/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './list-with-pagination.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  ifBlock,
  option,
  pendingBlock,
  select,
  span,
  heading,
  td,
  tr,
  table,
  tbody,
} from '@craft-ng/component';
import {
  insertStoragePersister,
  craftUnique,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  craftMethod,
  query,
  queryParams,
  craftComputed,
} from '@craft-ng/core';
import { paginationQueryParams } from '../../../query-params.utils';
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
      paginationQueryParams(),
      ({ patch, state }) => ({
        nextPage: function* () {
          const _state = yield* state();
          return yield* patch({ page: _state.page + 1 });
        },
        previousPage: function* () {
          const _state = yield* state();
          return yield* patch({ page: Math.max(1, _state.page - 1) });
        },
        updatePageSize: function* (pageSize: number) {
          return yield* patch({ pageSize, page: 1 });
        },
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
        insertStoragePersister(craftUnique({
          storeName: 'demo-app',
          key: 'list-with-pagination',
        })),
        insertPaginationPlaceholderData(
          { initialValue: [] as User[] },
          ({ currentPageStatus }) => ({
            isCurrentPageResolved: craftComputed(
              'isCurrentPageResolved',
              function* () {
                return (yield* currentPageStatus()) === 'resolved';
              },
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
    // `currentPageStatus` is a settled read: it suspends whenever the page on
    // screen has no value of its own — on the first load, and again on every
    // page change. The badge and the table each get their OWN boundary, so a
    // page change suspends the badge alone while the table keeps showing the
    // previous page's rows, which is the whole point of the placeholder
    // insertion. One boundary around both would hide them.
    return div([
      heading([
        'User Management: ',
        span({}, [
          StatusComponent({
            status: usersQuery.currentPageStatus,
          }),
        ]).pipe(pendingBlock({ fallback: () => span({}, '⏳') })),
      ]),
      table(
        { class: 'table' },
        tbody(
          each(
            usersQuery.currentPageData,
            {
              track: (user) => user.id,
              empty: () =>
                tr(
                  td(
                    ifBlock(
                      usersQuery.isCurrentPageResolved,
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
      // Only reached on the very first load: once a page has been shown, the
      // placeholder keeps `currentPageData` non-empty, so the empty slot (and
      // the settled read inside it) never runs again.
      ).pipe(pendingBlock({ fallback: () => div('⏳ Loading users…') })),
      div({ class: 'pagination' }, [
        select(
          'PageSize',
          {
            'aria-label': 'Page size',
            value: function* () {
              return String((yield* pagination()).pageSize);
            },
            change: updatePageSize,
          },
          [2, 4, 8, 16].map((size) =>
            option(
              {
                value: String(size),
                selected: function* () {
                  return size === (yield* pagination()).pageSize;
                },
              },
              size,
            ),
          ),
        ),
        button('PreviousPage', { type: 'button', click: pagination.previousPage }, 'Previous'),
        span(
          'CurrentPage',
          { class: 'current-page' },
          function* () {
            return (yield* pagination()).page;
          },
        ),
        button('NextPage', { type: 'button', click: pagination.nextPage }, 'Next'),
      ]),
    ]);
  },
);

export default ListWithPagination;
