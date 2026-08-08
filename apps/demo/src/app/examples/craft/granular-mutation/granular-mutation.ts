import styles from './granular-mutation.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  h,
  h2,
  option,
  select,
} from '@craft-ng/component';
import {
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
  queryParams,
  toCraftStatus,
} from '@craft-ng/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const { provideGranularMutation, GranularMutation } = craftService(
  { name: 'GranularMutation', scope: 'toProvide' },
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
    const updateUserName = yield* mutation('updateUserName', {
      method: (user: User) => ({ ...user, name: `${user.name}-` }),
      identifier: ({ id }) => id,
      loader: function* ({ params }) {
        return yield* ApiService.updateItem(params);
      },
    });
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
          key: 'granular',
        }),
        insertPaginationPlaceholderData({ initialValue: [] as User[] }),
        insertReactOnMutation(updateUserName, {
          filter: ({ mutationIdentifier, queryResource }) =>
            queryResource
              .value()
              ?.some(({ id }) => id === mutationIdentifier) ?? false,
          optimisticUpdate: ({
            queryResource,
            mutationIdentifier,
            mutationParams,
          }) =>
            (queryResource.value() ?? []).map((user) =>
              user.id === mutationIdentifier ? mutationParams : user,
            ),
        }),
      ),
    );
    return { pagination, users, updateUserName };
  },
);

const GranularMutationCraft = craftComponent(
  'GranularMutationCraft',
  {
    stylesUrl: styles,
    providers: [provideGranularMutation()],
  },
  function* () {
    const store = yield* GranularMutation();
    const updatePageSize = craftMethod(
      'updatePageSize',
      function* (event: Event) {
        (yield* GranularMutation()).pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        );
      },
    );
    return { store, updatePageSize };
  },
  ({ store: { users, updateUserName, pagination }, updatePageSize }) =>
    div([
      h2([
        'User Management: ',
        StatusComponent({
          status: () => toCraftStatus(users.currentPageStatus(), false),
        }),
      ]),
      h(
        'table',
        h(
          'tbody',
          each(
            () => users.currentPageData(),
            { track: (user) => user.id },
            (user) =>
              h('tr', [
                h('td', user.id),
                h('td', user.name),
                h(
                  'td',
                  button(
                    {
                      disabled: updateUserName.select(user.id)?.isLoading(),
                      click: () => updateUserName.mutate(user),
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
          value: pagination().pageSize,
          change: (event) => updatePageSize(event),
        },
        [2, 4, 8, 16].map((size) => option({ value: size }, size)),
      ),
      button({ click: pagination.previousPage }, 'Previous'),
      button({ click: pagination.nextPage }, 'Next'),
    ]),
);

export default GranularMutationCraft;
