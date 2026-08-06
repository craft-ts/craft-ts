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
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertQueryPipe,
  query,
  queryParams,
  toCraftStatus,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const ListWithPagination = craftComponent(
  'ListWithPagination',
  {
    styles: `
      :scope{display:block;background:#f5f7fa;padding:24px;border-radius:12px}
      .table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.05)}
      .table td{padding:16px;text-align:left;border-bottom:1px solid #edf2f7}
      .table tr:last-child td{border-bottom:none}
      .table tbody tr:hover{background:#f8fafc}
      .pagination{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:20px}
      .pagination select,.pagination button{padding:8px 16px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;color:#4a5568;font-weight:500;cursor:pointer}
      .pagination button:hover{background:#f8fafc;border-color:#cbd5e0}
      .pagination button:disabled{opacity:.5;cursor:not-allowed}
      .pagination .current-page{font-weight:500;color:#4a5568}
    `,
  },
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
    const api = yield* ApiService();
    const { usersQuery } = yield* query(
      'usersQuery',
      {
        params: pagination,
        identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
        loader: ({ params }) => api.getDataList(params),
      },
      insertQueryPipe(
          insertLocalStoragePersister({
            storeName: 'demo-app',
            key: 'list-with-pagination',
          }),
          insertPaginationPlaceholderData({ initialValue: [] as User[] }),
        ),
    );
    return { pagination, usersQuery };
  },
  ({ pagination, usersQuery }) =>
    div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => toCraftStatus(usersQuery.currentPageStatus(), false),
        }),
      ]),
      h(
        'table',
        { class: 'table' },
        h(
          'tbody',
          each(
            () => usersQuery.currentPageData() ?? [],
            {
              track: (user) => user.id,
              empty: () =>
                h(
                  'tr',
                  h(
                    'td',
                    usersQuery.currentPageStatus() === 'resolved'
                      ? 'No users found'
                      : 'Loading…',
                  ),
                ),
            },
            (user) => h('tr', [h('td', String(user.id)), h('td', user.name)]),
          ),
        ),
      ),
      div({ class: 'pagination' }, [
        select(
          {
            value: String(pagination().pageSize),
            change: (event) =>
              pagination.updatePageSize(
                Number((event.target as HTMLSelectElement).value),
              ),
          },
          [2, 4, 8, 16].map((size) =>
            option({ value: String(size) }, String(size)),
          ),
        ),
        button({ click: pagination.previousPage }, 'Previous'),
        span({ class: 'current-page' }, String(pagination().page)),
        button({ click: pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default ListWithPagination;
