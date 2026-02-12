import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  craft,
  craftInject,
  craftQueryParam,
  craftMutations,
  craftAsyncProcesses,
  craftQuery,
  craftState,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  asyncProcess,
  mutation,
  query,
  queryParam,
  state,
  removeOne,
  removeMany,
  reactiveWritableSignal,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, User } from './api.service';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { injectFullDemoCraft, provideFullDemoCraft } = craft(
  {
    name: 'fullDemo',
    providedIn: 'scoped',
  },
  craftInject(() => ({
    ApiService,
  })),
  craftQueryParam('pagination', () =>
    queryParam(
      {
        state: {
          page: {
            fallbackValue: 1,
            parse: (value) => parseInt(value, 10),
            serialize: (value) => String(value),
          },
          pageSize: {
            fallbackValue: 4,
            parse: (value) => parseInt(value, 10),
            serialize: (value) => String(value),
          },
        },
      },
      ({ patch, state }) => ({
        nextPage: () => patch({ page: state().page + 1 }),
        previousPage: () => patch({ page: state().page - 1 }),
        updatePageSize: (newPageSize: number) =>
          patch({ pageSize: newPageSize, page: 1 }),
      }),
    ),
  ),
  craftMutations(({ apiService }) => ({
    bulkDelete: mutation({
      method: (ids: string[]) => ids,
      loader: async ({ params: ids }) => {
        await apiService.bulkDelete(ids);
        return ids;
      },
    }),
  })),
  craftAsyncProcesses(() => ({
    delayUserDeletion: asyncProcess({
      method: (payload: { user: User; action: 'delete' | 'cancel' }) => payload,
      identifier: ({ user: { id } }) => id,
      loader: async ({ params: { user, action } }) => {
        if (action === 'cancel') {
          return undefined;
        }
        await wait(5000);
        return user;
      },
    }),
  })),
  craftMutations(({ apiService, delayUserDeletion }) => ({
    deleteUser: mutation({
      fromResourceById: delayUserDeletion._resourceById,
      params: (resource) => {
        const value = resource?.safeValue();
        return value
          ? {
              ...value,
              name: value?.name + '-',
            }
          : undefined;
      },
      identifier: ({ id }) => id,
      loader: ({ params: user }) => apiService.updateItem(user),
    }),
  })),
  craftQuery('users', ({ pagination, apiService, deleteUser, bulkDelete }) =>
    query(
      {
        params: pagination,
        identifier: (params) => `${params.page}-${params.pageSize}`,
        loader: ({ params: pagination }) => apiService.getDataList(pagination),
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'full-demo',
      }),
      insertPaginationPlaceholderData,
      insertReactOnMutation(deleteUser, {
        filter: ({ mutationIdentifier, queryResource }) =>
          !!queryResource
            .safeValue()
            ?.some((item) => item.id === mutationIdentifier),
        optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
          removeOne({
            entities: queryResource.value(),
            id: mutationIdentifier,
          }),
        reload: {
          onMutationError: true,
        },
      }),
      insertReactOnMutation(deleteUser, {
        filter: ({ queryResource }) => queryResource.safeValue()?.length === 0,
        reload: {
          // reload the current page if there is no more data after mutation
          onMutationResolved: true,
        },
      }),
      insertReactOnMutation(bulkDelete, {
        filter: ({ queryResource }) =>
          (queryResource.safeValue()?.length ?? 0) > 0,
        optimisticUpdate: ({ queryResource, mutationParams }) =>
          removeMany({
            entities: queryResource.value(),
            ids: mutationParams,
          }),
      }),
      insertReactOnMutation(bulkDelete, {
        filter: ({ queryResource }) => queryResource.safeValue()?.length === 0,
        reload: {
          onMutationResolved: true,
        },
      }),
    ),
  ),
  craftState('selectedRows', ({ users, bulkDelete, deleteUser }) =>
    state(
      reactiveWritableSignal([] as string[], (sync) => ({
        resetWhenCurrentPageIsResolved: sync(
          users.currentPageStatus,
          ({ params, current }) => (params === 'resolved' ? [] : current),
        ),
        resetWhenBulkDeleteIsResolved: sync(
          bulkDelete.status,
          ({ params, current }) => (params === 'resolved' ? [] : current),
        ),
        removeDeletedItemsWhenDeleteUserIsResolved: sync(
          deleteUser.changes.resolved,
          ({ params: resolvedIds, current }) =>
            resolvedIds.length > 0
              ? removeMany({
                  entities: current,
                  ids: resolvedIds,
                })
              : current,
        ),
      })),
      ({ update, set, state: selectedRows }) => {
        const isAllSelected = computed(
          () =>
            users.currentPageData()?.length &&
            users
              .currentPageData()
              ?.every((user) => selectedRows().includes(user.id)),
        );
        return {
          toggleSelection: (id: string) =>
            update((current) =>
              current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id],
            ),
          isSelected: (id: string) => {
            return selectedRows().includes(id);
          },
          isAllSelected,
          isSomeSelected: computed(
            () =>
              users
                .currentPageData()
                ?.some((user) => selectedRows().includes(user.id)) &&
              !isAllSelected(),
          ),
          toggleAllSelection: () => {
            if (isAllSelected()) {
              set([]);
            } else {
              const allIds =
                users.currentPageData()?.map((user) => user.id) || [];
              set(allIds);
            }
          },
        };
      },
    ),
  ),
);

@Component({
  selector: 'app-full-demo',
  imports: [CommonModule, StatusComponent],
  template: `
    <div class="container">
      <main class="content">
        <div class="content-wrapper">
          <div class="card">
            <h2 class="card-title">
              User Management:
              <app-status [status]="store.users.currentPageStatus()" />
            </h2>

            <div style="margin-bottom: 16px">
              <button
                class="action-btn"
                [disabled]="
                  store.selectedRows().length === 0 ||
                  store.bulkDelete.status() === 'loading'
                "
                (click)="store.mutateBulkDelete(store.selectedRows())"
              >
                Bulk Delete Selected Users ({{
                  store.selectedRows().length || '-'
                }})
                <app-status [status]="store.bulkDelete.status()" />
              </button>
            </div>

            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        [checked]="store.selectedRowsIsAllSelected()"
                        [indeterminate]="store.selectedRowsIsSomeSelected()"
                        (change)="store.selectedRowsToggleAllSelection()"
                      />
                    </th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  @if (store.users.currentPageData()) {
                    @for (
                      user of store.users.currentPageData();
                      track user.id
                    ) {
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            [checked]="store.selectedRowsIsSelected(user.id)"
                            (change)="
                              store.selectedRowsToggleSelection(user.id)
                            "
                          />
                        </td>
                        <td>{{ user.id }}</td>

                        <td>{{ user.name }}</td>

                        <td>
                          @let delayDeleteUserRef =
                            store.delayUserDeletion.select(user.id);

                          @if (delayDeleteUserRef?.status() === 'loading') {
                            <button
                              class="action-btn cancel-btn"
                              (click)="
                                store.setDelayUserDeletion({
                                  user,
                                  action: 'cancel',
                                })
                              "
                            >
                              Cancel Deletion (5s)
                            </button>
                          } @else {
                            <button
                              class="action-btn"
                              (click)="
                                store.setDelayUserDeletion({
                                  user,
                                  action: 'delete',
                                })
                              "
                            >
                              Delete User
                            </button>
                          }
                        </td>
                      </tr>
                    } @empty {
                      @if (
                        store.users.currentPageStatus() === 'resolved' ||
                        store.users.currentPageStatus() === 'local'
                      ) {
                        <tr>
                          <td
                            colspan="5"
                            style="text-align: center; padding: 32px"
                          >
                            No users found
                          </td>
                        </tr>
                      } @else {
                        <tr>
                          <td
                            colspan="5"
                            style="text-align: center; padding: 32px"
                          >
                            Loading...
                          </td>
                        </tr>
                      }
                    }
                  } @else {
                    <tr>
                      <td colspan="5" style="text-align: center; padding: 32px">
                        Loading...
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="pagination">
              <select
                [value]="store.pagination().pageSize"
                (change)="updatePageSize($event)"
                style="margin-right: 8px"
              >
                <option [value]="2">2</option>
                <option [value]="4">4</option>
                <option [value]="8">8</option>
                <option [value]="16">16</option>
              </select>
              <button class="btn" (click)="store.previousPagePagination()">
                Previous
              </button>
              <span class="current-page">
                {{ store.pagination().page }}
              </span>
              <button class="btn" (click)="store.nextPagePagination()">
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `,
  styleUrls: ['./full-demo.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideFullDemoCraft()],
})
export default class FullDemoCraft {
  protected readonly store = injectFullDemoCraft({});

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.store.updatePageSizePagination(value);
  }

  test() {
    // this.store.delayUserDeletion.set // todo should not be exposed
  }
}
