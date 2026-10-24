import {
  button,
  craftComponent,
  div,
  forNode,
  option,
  pendingNode,
  select,
  span,
  heading,
  td,
  tr,
  table,
  tbody,
} from '@craft-ts/component';
import {
  craftService,
  craftMethod,
  craftExpose,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  insertStoragePersister,
  craftUnique,
  query,
} from '@craft-ts/core';
import { RoutePaginationQueryParams } from './qp-list-with-pagination.route';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';
import { buttonUi } from '@craft-ts/ui/style';

export const { QpListWithPaginationView, provideQpListWithPaginationView } =
  craftService(
    { name: 'qpListWithPaginationView', providedIn: 'toProvide' },
    function* () {
      const pagination = yield* RoutePaginationQueryParams();
      yield* craftExpose('pagination', pagination);
      const api = yield* ApiService();
      yield* query(
        'usersQueryListWithPaginationQpListWithPagination',
        {
          params: pagination,
          identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
          loader: function* ({ params }) {
            return yield* api.getDataList(params);
          },
        },
        insertQueryPipe(
          insertStoragePersister(
            craftUnique({
              storeName: 'demo-app',
              key: 'route-list-with-pagination',
            }),
          ),
          insertPaginationPlaceholderData({ initialValue: Array<User>() }),
        ),
      );
      yield* craftMethod('updatePageSizeListWithPaginationQpListWithPagination', function* (event: Event) {
        yield* pagination.updatePageSize(Number(eventValue(event)));
      });
    },
  );

const QpListWithPagination = craftComponent(
  'QpListWithPagination',
  {
    providers: [provideQpListWithPaginationView()],
  },
  () =>
    div({ class: example.panel }, [
      heading({ class: example.title }, [
        'Route QueryParams pagination: ',
        StatusComponent({
          status: QpListWithPaginationView.usersQuery.currentPageStatus,
        }),
      ]).pipe(
        pendingNode({
          fallback: () =>
            heading(
              { class: example.title },
              'Route QueryParams pagination: Loading…',
            ),
        }),
      ),
      table(
        { class: example.table },
        tbody(
          forNode(
            QpListWithPaginationView.usersQuery.currentPageData,
            { track: (user) => user.id },
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
      ),
      div({ class: example.pagination, 'data-testid': 'pagination' }, [
        select(
          'pageSize',
          {
            class: example.pageSize,
            'aria-label': 'Page size',
            value: QpListWithPaginationView.pagination.pageSize,
            change: QpListWithPaginationView.updatePageSize,
          },
          [2, 4, 8, 16].map((size) => option({ value: size }, size)),
        ),
        button(
          'previousPage',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            click: QpListWithPaginationView.pagination.previousPage,
          },
          'Previous',
        ),
        span(
          { class: example.currentPage, 'data-testid': 'current-page' },
          QpListWithPaginationView.pagination.page,
        ),
        button(
          'nextPage',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            click: QpListWithPaginationView.pagination.nextPage,
          },
          'Next',
        ),
      ]),
    ]),
);

export default QpListWithPagination;
