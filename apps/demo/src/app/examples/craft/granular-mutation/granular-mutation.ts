import {
  button,
  component,
  div,
  each,
  h,
  h2,
  option,
  select,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftMethod,
  craftPipe,
  craftService,
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

const { provideGranularMutation, GranularMutationToYield } = craftService(
  { name: 'GranularMutation', scope: 'toProvide' },
  function* () {
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
    const updateUserName = yield* mutation({
      method: (user: User) => ({ ...user, name: `${user.name}-` }),
      identifier: ({ id }) => id,
      loader: function* ({ params }) {
        return yield* ApiServiceToYield.updateItem(params);
      },
    });
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
    return { pagination, users, updateUserName };
  },
);

const GranularMutationCraft = component(
  {
    providers: [
      provideGranularMutation(),
      provideHostName('component:GranularMutationCraft'),
    ],
  },
  function* () {
    componentMonitoring();
    const store = yield* GranularMutationToYield();
    const updatePageSize = craftMethod(
      'updatePageSize',
      function* (event: Event) {
        (yield* GranularMutationToYield()).pagination.updatePageSize(
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
      ]),
      h(
        'table',
        h(
          'tbody',
          each(
            () => store.users.currentPageData() ?? [],
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
                        store.updateUserName.select(user.id)?.isLoading() ??
                        false,
                      click: () => store.updateUserName.mutate(user),
                    },
                    'Update Name',
                  ),
                ),
              ]),
          ),
        ),
      ),
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
      button({ click: store.pagination.nextPage }, 'Next'),
    ]),
);

export default GranularMutationCraft;
