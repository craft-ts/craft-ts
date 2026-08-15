/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './granular-mutation.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  main,
  option,
  select,
  span,
  table,
  thead,
  th,
  td,
  heading,
  tr,
  tbody,
} from '@craft-ng/component';
import {
  insertQueryPipe,
  insertStoragePersister,
  craftUnique,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  craftMethod,
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
        insertStoragePersister(craftUnique({
          storeName: 'demo-app',
          key: 'granular',
        })),
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
      updatePageSize: craftMethod('updatePageSize', function* (event: Event) {
        yield* pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        );
      }),
    };
  },
  ({ pagination, updatePageSize, updateUserName, usersQuery }) =>
    div({ class: 'container' }, [
      main({ class: 'content' }, [
        div({ class: 'content-wrapper' }, [
          div({ class: 'card' }, [
            heading({ class: 'card-title' }, [
              'User Management: ',
              StatusComponent({
                status: usersQuery.currentPageStatus,
              }),
            ]),
            div({ class: 'table-container' }, [
              table( { class: 'table' }, [
                thead( [
                  tr( [th( 'ID'), th( 'Name'), th( 'Action')]),
                ]),
                tbody(
                  each(
                    usersQuery.currentPageData,
                    { track: (user) => user.id },
                    (user) =>
                      tr( [
                        td( function* () {
                          return (yield* user()).id;
                        }),
                        td( function* () {
                          return (yield* user()).name;
                        }),
                        td(
                          button(
                            'UpdateUserName',
                            { type: 'button',
                              class: 'action-btn',
                              disabled: function* () {
                                return updateUserName
                                  .select((yield* user()).id)
                                  ?.isLoading();
                              },
                              *click() {
                                yield* updateUserName.mutate(yield* user());
                              },
                            },
                            [
                              'Update Name',
                              StatusComponent({
                                status: function* () {
                                  return yield* updateUserName
                                    .selectOrCreate((yield* user()).id)
                                    .status();
                                },
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
              button(
                'PreviousPage',
                { type: 'button', class: 'btn', click: pagination.previousPage },
                'Previous',
              ),
              span(
                'CurrentPage',
                { class: 'current-page' },
                function* () {
                  return (yield* pagination()).page;
                },
              ),
              button(
                'NextPage',
                { type: 'button', class: 'btn', click: pagination.nextPage },
                'Next',
              ),
            ]),
          ]),
        ]),
      ]),
    ]),
);

export default GranularMutation;
