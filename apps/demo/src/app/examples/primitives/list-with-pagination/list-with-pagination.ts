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
  craftPipe,
  craftUse,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  provideHostName,
  query,
  queryParams,
  type GetDeps,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { injectApiService, type User } from './api.service';

const ListWithPagination = component(
  { providers: [provideHostName('component:ListWithPagination')] },
  () => {
    componentMonitoring();
    const pagination = craftUse(
      queryParams(
        {
          state: {
            page: { fallbackValue: 1, parse: Number, serialize: String },
            pageSize: { fallbackValue: 4, parse: Number, serialize: String },
          },
        },
        ({ patch, state }) => ({
          nextPage: () => patch({ page: state().page + 1 }),
          previousPage: () => patch({ page: state().page - 1 }),
          updatePageSize: (pageSize: number) =>
            patch({ pageSize, page: 1 }),
        }),
      ),
    );
    const api = injectApiService();
    const usersQuery = craftUse(
      query(
        {
          params: pagination,
          identifier: ({ page, pageSize }) => `${page}-${pageSize}`,
          loader: ({ params }) => api.getDataList(params),
        },
        (context) =>
          craftPipe(
            context,
            insertLocalStoragePersister({
              storeName: 'demo-app',
              key: 'list-with-pagination',
            }),
            insertPaginationPlaceholderData({ initialValue: [] as User[] }),
          ),
      ),
    );
    return { pagination, usersQuery };
  },
  ({ pagination, usersQuery }) =>
    div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => usersQuery.currentPageStatus(),
        }),
      ]),
      h(
        'table',
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
            (user) =>
              h('tr', [h('td', String(user.id)), h('td', user.name)]),
          ),
        ),
      ),
      div([
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
        span(String(pagination().page)),
        button({ click: pagination.nextPage }, 'Next'),
      ]),
    ]),
);

export default ListWithPagination;
export type GenDeps_ListWithPagination = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
