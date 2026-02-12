import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  asyncProcess,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
  queryParam,
  reactiveWritableSignal,
  removeMany,
  removeOne,
  state,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, User } from './api.service';

@Component({
  selector: 'app-granular-mutation',
  imports: [CommonModule, StatusComponent],
  template: `
    <div class="container">
      <main class="content">
        <div class="content-wrapper">
          <div class="card">
            <h2 class="card-title">
              User Management:
              <app-status [status]="usersQuery.currentPageStatus()" />
            </h2>

            <div style="margin-bottom: 16px">
              <button
                class="action-btn"
                [disabled]="
                  selectedRows().length === 0 ||
                  bulkDelete.status() === 'loading'
                "
                (click)="bulkDelete.mutate(selectedRows())"
              >
                Bulk Delete Selected Users ({{ selectedRows().length || '-' }})
                <app-status [status]="bulkDelete.status()" />
              </button>
            </div>

            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        [checked]="selectedRows.isAllSelected()"
                        [indeterminate]="selectedRows.isSomeSelected()"
                        (change)="selectedRows.toggleAllSelection()"
                      />
                    </th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  @if (usersQuery.currentPageData()) {
                    @for (user of usersQuery.currentPageData(); track user.id) {
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            [checked]="selectedRows.isSelected(user.id)"
                            (change)="selectedRows.toggleSelection(user.id)"
                          />
                        </td>
                        <td>{{ user.id }}</td>

                        <td>{{ user.name }}</td>

                        <td>
                          @let delayDeleteUserRef =
                            delayUserDeletion.select(user.id);

                          @if (delayDeleteUserRef?.status() === 'loading') {
                            <button
                              class="action-btn cancel-btn"
                              (click)="
                                delayUserDeletion.method({
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
                                delayUserDeletion.method({
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
                        usersQuery.currentPageStatus() === 'resolved' ||
                        usersQuery.currentPageStatus() === 'local'
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
                [value]="pagination().pageSize"
                (change)="updatePageSize($event)"
                style="margin-right: 8px"
              >
                <option [value]="2">2</option>
                <option [value]="4">4</option>
                <option [value]="8">8</option>
                <option [value]="16">16</option>
              </select>
              <button class="btn" (click)="pagination.previousPage()">
                Previous
              </button>
              <span class="current-page">
                {{ pagination().page }}
              </span>
              <button class="btn" (click)="pagination.nextPage()">Next</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `,
  styleUrls: ['./full-demo.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class FullDemo {
  protected readonly pagination = queryParam(
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
  );
  private readonly apiService = inject(ApiService);

  protected readonly bulkDelete = mutation({
    method: (ids: string[]) => ids,
    loader: async ({ params: ids }) => {
      await this.apiService.bulkDelete(ids);
      return ids;
    },
  });

  protected readonly delayUserDeletion = asyncProcess({
    method: (payload: { user: User; action: 'delete' | 'cancel' }) => payload,
    identifier: ({ user: { id } }) => id,
    loader: async ({ params: { user, action } }) => {
      if (action === 'cancel') {
        return undefined;
      }
      await wait(5000);
      return user;
    },
  });

  protected readonly deleteUser = mutation({
    fromResourceById: this.delayUserDeletion._resourceById,
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
    loader: ({ params: user }) => {
      console.log('mutation loader user', user);
      return this.apiService.updateItem(user);
    },
  });

  protected readonly usersQuery = query(
    {
      params: this.pagination,
      identifier: (params) => `${params.page}-${params.pageSize}`,
      loader: ({ params: pagination }) =>
        this.apiService.getDataList(pagination),
    },
    insertLocalStoragePersister({
      storeName: 'demo-app',
      key: 'granular',
    }),
    insertPaginationPlaceholderData,
    insertReactOnMutation(this.deleteUser, {
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
    insertReactOnMutation(this.deleteUser, {
      filter: ({ queryResource }) => queryResource.safeValue()?.length === 0,
      reload: {
        // reload the current page if there is no more data after mutation
        onMutationResolved: true,
      },
    }),
    insertReactOnMutation(this.bulkDelete, {
      filter: ({ queryResource }) =>
        (queryResource.safeValue()?.length ?? 0) > 0,
      optimisticUpdate: ({ queryResource, mutationParams }) =>
        removeMany({
          entities: queryResource.value(),
          ids: mutationParams,
        }),
      reload: {
        onMutationError: true,
      },
    }),
    insertReactOnMutation(this.bulkDelete, {
      filter: ({ queryResource }) => queryResource.safeValue()?.length === 0,
      reload: {
        // reload the current page if there is no more data after mutation
        onMutationResolved: ({ queryResource }) =>
          queryResource.safeValue()?.length === 0,
      },
    }),
  );

  protected readonly selectedRows = state(
    reactiveWritableSignal([] as string[], (sync) => ({
      resetWhenCurrentPageIsResolved: sync(
        this.usersQuery.currentPageStatus,
        ({ params, current }) => (params === 'resolved' ? [] : current),
      ),
      resetWhenBulkDeleteIsResolved: sync(
        this.bulkDelete.status,
        ({ params, current }) => (params === 'resolved' ? [] : current),
      ),
      removeDeletedItemsWhenDeleteUserIsResolved: sync(
        this.delayUserDeletion.changes.resolved,
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
          this.usersQuery.currentPageData()?.length &&
          this.usersQuery
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
            this.usersQuery
              .currentPageData()
              ?.some((user) => selectedRows().includes(user.id)) &&
            !isAllSelected(),
        ),
        toggleAllSelection: () => {
          if (isAllSelected()) {
            set([]);
          } else {
            const allIds =
              this.usersQuery.currentPageData()?.map((user) => user.id) || [];
            set(allIds);
          }
        },
      };
    },
  );

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.pagination.updatePageSize(value);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
