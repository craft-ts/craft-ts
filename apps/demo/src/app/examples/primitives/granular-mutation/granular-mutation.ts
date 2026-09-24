import {
  button,
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
  insertQueryPipe,
  insertStoragePersister,
  craftUnique,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  craftMethod,
  mutation,
  query,
  queryParams,
} from '@craft-ts/core';
import { paginationQueryParams } from '../../../query-params.utils';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';

const GranularMutation = craftComponent(
  'GranularMutation',
  {},
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
        insertPaginationPlaceholderData({ initialValue: Array<User>() }),
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
    function* isUpdatePending(user: User) {
      const pending = updateUserName.select(user.id);
      return pending ? yield* pending.isLoading() : false;
    }
    return {
      pagination,
      updateUserName,
      usersQuery,
      isUpdatePending,
      updatePageSize: craftMethod('updatePageSize', function* (event: Event) {
        yield* pagination.updatePageSize(
          Number(eventValue(event)),
        );
      }),
    };
  },
  ({ pagination, updatePageSize, updateUserName, usersQuery, isUpdatePending }) =>
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
                  status: usersQuery.currentPageStatus,
                }),
              ]).pipe(pendingNode({ fallback: () => span({}, '⏳') })),
            ]),
            div([
              table({ class: example.table }, [
                thead( [
                  tr({ class: example.tableRow }, [th({ class: example.th }, 'ID'), th({ class: example.th }, 'Name'), th({ class: example.th }, 'Action')]),
                ]),
                tbody(
                  forNode(
                    usersQuery.currentPageData,
                    { track: (user) => user.id },
                    (user) =>
                      tr({ class: example.tableRow }, [
                        td({ class: example.td }, function* () {
                          return (yield* user()).id;
                        }),
                        td({ class: example.td }, function* () {
                          return (yield* user()).name;
                        }),
                        td({ class: example.td }, button(
                            'UpdateUserName',
                            { type: 'button',
                              class: example.button,
                              'data-exampleButton': 'subtle',
                              'data-testid': 'update-user',
                              disabled: function* () {
                                // `isLoading()` is a reactive read: without
                                // `yield*` it returns the generator itself,
                                // which is truthy — every button rendered
                                // disabled before it had ever been clicked.
                                return yield* isUpdatePending(yield* user());
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
            div({ class: example.pagination, 'data-testid': 'pagination' }, [
              select(
                'PageSize',
                {
                  class: example.select,
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
                { type: 'button', class: example.button, click: pagination.previousPage },
                'Previous',
              ),
              span(
                'CurrentPage',
                { class: example.currentPage, 'data-testid': 'current-page' },
                function* () {
                  return (yield* pagination()).page;
                },
              ),
              button(
                'NextPage',
                { type: 'button', class: example.button, click: pagination.nextPage },
                'Next',
              ),
            ]),
          ]),
        ]),
      ]),
    ]),
);

export default GranularMutation;
