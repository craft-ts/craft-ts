import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  asyncProcess,
  cMinLength,
  cRequired,
  insertForm,
  insertFormAttributes,
  insertFormSubmit,
  insertLocalStoragePersister,
  insertNoopTypingAnchor,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  insertSelectFormTree,
  mutation,
  on$,
  query,
  queryParam,
  reactiveWritableSignal,
  removeMany,
  removeOne,
  source$,
  state,
  ValidatedFormValue,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, User } from './api.service';
import { FormField } from '@angular/forms/signals';

@Component({
  selector: 'app-granular-mutation',
  imports: [CommonModule, StatusComponent, FormField],
  template: `
    <div class="container">
      <main class="content">
        <div class="content-wrapper">
          <div class="card">
            <h2 class="card-title">
              User Management:
              <app-status [status]="usersByPage.status()" />
            </h2>

            <div
              style="margin-bottom: 16px;display: flex; gap: 8px; align-items: center"
            >
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
              <button class="action-btn reset-btn" (click)="reset$.emit()">
                Reset Filters
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
                  @if (this.usersByPage().length) {
                    @for (user of this.usersByPage(); track user.id) {
                      <tr>
                        @let userForm = this.usersByPage.select(user.id);

                        <td>
                          <input
                            type="checkbox"
                            [checked]="selectedRows.isSelected(user.id)"
                            (change)="selectedRows.toggleSelection(user.id)"
                          />
                        </td>
                        <td>{{ user.id }}</td>

                        <!-- todo -->
                        <td>
                          @let nameField = userForm().selectName();
                          <input type="text" [formField]="nameField" />
                          hasExceptions{{nameField().hasExceptions()}}
                          @if (nameField().hasExceptions()) {
                            <div class="field-errors">
                              @for (
                                error of nameField().exceptions().list;
                                track error.code
                              ) {
                                {{nameField().exceptions().list | json}}
                                @let code = error.code;
                                @switch (code) {
                                  @case ('required') {
                                    <span>Name is required.</span>
                                  }
                                  @case ('minLength') {
                                    <span>
                                      Name must be at least
                                      {{ error.payload }} characters
                                      long.
                                    </span>
                                  }
                                  @default never;
                                }
                              }
                            </div>
                          }
                        </td>

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
                        usersByPage.status() === 'resolved' ||
                        usersByPage.status() === 'local'
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
  protected readonly reset$ = source$<void>();
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
    ({ patch, state, reset }) => ({
      nextPage: () => patch({ page: state().page + 1 }),
      previousPage: () => patch({ page: state().page - 1 }),
      updatePageSize: (newPageSize: number) =>
        patch({ pageSize: newPageSize, page: 1 }),
      reset: on$(this.reset$, () => reset()),
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

  private readonly updateUserName = mutation({
    method: (
      payload: NonNullable<
        ValidatedFormValue<{ userName: string; user: User }>
      >,
    ) => ({
      ...payload.user,
      name: payload.userName,
    }),
    identifier: ({ id }) => id,
    loader: ({ params: user }) => this.apiService.updateItem(user),
  });

  private readonly usersQuery = query(
    {
      params: this.pagination,
      identifier: (params) => `${params.page}-${params.pageSize}`,
      loader: ({ params: pagination }) =>
        this.apiService.getDataList(pagination),
    },
    insertLocalStoragePersister({
      storeName: 'demo-app-full-demo',
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

  protected readonly usersByPage = state(
    computed(() => this.usersQuery.currentPageData() ?? []),
    () => ({
      status: this.usersQuery.currentPageStatus,
    }),
    insertForm(
      { identifier: ({ item: { id } }) => id },
      insertFormSubmit(this.updateUserName),
      insertSelectFormTree(
        'name',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired(), cMinLength({ minLength: 3 })],
        })),
      ),
    ),
  );

  constructor() {
    // effect(() => {
    //   const nameFieldTree = this.usersByPage.select('1')?.().selectName();
    //   console.log('nameFieldTree', nameFieldTree());
    // });
  }

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
    ({ state: selectedRows }) => ({
      isAllSelected: computed(
        () =>
          this.usersQuery.currentPageData()?.length &&
          this.usersQuery
            .currentPageData()
            ?.every((user) => selectedRows().includes(user.id)),
      ),
    }),
    ({ update, set, state: selectedRows, insertions: { isAllSelected } }) => ({
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
      reset: on$(this.reset$, () => set([])),
    }),
  );

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.pagination.updatePageSize(value);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
