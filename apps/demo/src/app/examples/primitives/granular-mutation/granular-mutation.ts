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
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  provideHostName,
  query,
  queryParams,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';

const GranularMutation = component(
  { providers: [provideHostName('component:GranularMutation')] },
  function* () {
    componentMonitoring();
    const pagination = yield* queryParams(
      {
        state: {
          page: { fallbackValue: 1, parse: Number, serialize: String },
          pageSize: { fallbackValue: 4, parse: Number, serialize: String },
        },
      },
      ({ patch, state }) => ({
        nextPage: () => patch({ page: state().page + 1 }),
        previousPage: () => patch({ page: state().page - 1 }),
        updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
      }),
    );
    const api = yield* ApiServiceToYield();
    const updateUserName = yield* mutation({
      method: (user: User) => ({ ...user, name: `${user.name}-` }),
      identifier: ({ id }) => id,
      loader: ({ params }) => api.updateItem(params),
    });
    const usersQuery = yield* query(
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
            key: 'granular',
          }),
          insertPaginationPlaceholderData({ initialValue: [] as User[] }),
          insertReactOnMutation(updateUserName, {
            filter: ({ mutationIdentifier, queryResource }) =>
              queryResource
                .safeValue()
                ?.some(({ id }) => id === mutationIdentifier) ?? false,
            optimisticUpdate: ({
              queryResource,
              mutationIdentifier,
              mutationParams,
            }) =>
              queryResource
                .value()
                ?.map((user) =>
                  user.id === mutationIdentifier ? mutationParams : user,
                ),
          }),
        ),
    );
    return { pagination, updateUserName, usersQuery };
  },
  ({ pagination, updateUserName, usersQuery }) =>
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
            { track: (user) => user.id },
            (user) =>
              h('tr', [
                h('td', String(user.id)),
                h('td', user.name),
                h(
                  'td',
                  button(
                    {
                      disabled:
                        updateUserName.select(user.id)?.isLoading() ?? false,
                      click: () => updateUserName.mutate(user),
                    },
                    [
                      'Update Name ',
                      StatusComponent({
                        status: () =>
                          updateUserName.select(user.id)?.status() ?? 'idle',
                      }),
                    ],
                  ),
                ),
              ]),
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

export default GranularMutation;
