import styles from './granular-mutation.css' with { loader: 'text' };
import {
  button,
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
  insertQueryPipe,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
  queryParams,
} from '@craft-ng/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const GranularMutation = craftComponent(
  'GranularMutation',
  {
    stylesUrl: styles,
  },
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
        insertLocalStoragePersister({
          storeName: 'demo-app',
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
    return {
      pagination,
      updateUserName,
      usersQuery,
      updatePageSize: (event: Event) =>
        pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        ),
    };
  },
  ({ pagination, updatePageSize, updateUserName, usersQuery }) =>
    div({ class: 'container' }, [
      main({ class: 'content' }, [
        div({ class: 'content-wrapper' }, [
          div({ class: 'card' }, [
            h2({ class: 'card-title' }, [
              'User Management: ',
              StatusComponent({
                status: () => usersQuery.currentPageStatus(),
              }),
            ]),
            div({ class: 'table-container' }, [
              h('table', { class: 'table' }, [
                h('thead', [
                  h('tr', [h('th', 'ID'), h('th', 'Name'), h('th', 'Action')]),
                ]),
                h(
                  'tbody',
                  each(
                    usersQuery.currentPageData,
                    { track: (user) => user.id },
                    (user) =>
                      h('tr', [
                        h('td', user.id),
                        h('td', user.name),
                        h(
                          'td',
                          button(
                            'UpdateUserName',
                            {
                              class: 'action-btn',
                              disabled: () =>
                                updateUserName.select(user.id)?.isLoading(),
                              *click() {
                                yield* updateUserName.mutate(user);
                              },
                            },
                            [
                              'Update Name',
                              StatusComponent({
                                status: updateUserName.selectOrCreate(user.id)
                                  .status,
                              }),
                            ],
                          ),
                        ),
                      ]),
                  ),
                ),
              ]),
            ]),
            div({ class: 'pagination' }, [
              select(
                'PageSize',
                {
                  value: () => String(pagination().pageSize),
                  change: updatePageSize,
                },
                [2, 4, 8, 16].map((size) =>
                  option(
                    {
                      value: String(size),
                      selected: () => size === pagination().pageSize,
                    },
                    size,
                  ),
                ),
              ),
              button(
                'PreviousPage',
                { class: 'btn', click: pagination.previousPage },
                'Previous',
              ),
              span(
                'CurrentPage',
                { class: 'current-page' },
                () => pagination().page,
              ),
              button(
                'NextPage',
                { class: 'btn', click: pagination.nextPage },
                'Next',
              ),
            ]),
          ]),
        ]),
      ]),
    ]),
);

export default GranularMutation;
