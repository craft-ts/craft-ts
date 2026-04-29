import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
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
  updateOne,
  ValidatedFormValue,
  type GetDeps,
  type GetInjectedServiceDependencies,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { injectApiService, User } from './api.service';

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
              <label style="margin-left: auto; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input
                  type="checkbox"
                  [checked]="apiService.throwError()"
                  (change)="apiService.toggleUpdateError()"
                />
                Simulate API error
              </label>
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
                  @if (usersByPage.displayUsers()) {
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

                        <td>
                          @let nameField = userForm().selectName();
                          <!-- todo remove editingUserId -->
                          <!-- todo le form().submit() ne déclenche pas l'appel ? -->
                          <!-- todo afficher status de chargement du save -->
                          <!-- todo si form pas save et dif, afficher une état pour signaler que ce n'est pas save -->
                          @if (userForm().isEditing()) {
                            <form
                              (submit)="
                                $event.preventDefault(); userForm().submit()
                              "
                              novalidate
                            >
                              <div class="inline-edit">
                                <input
                                  type="text"
                                  class="inline-edit-input"
                                  [formField]="nameField"
                                />
                                <button
                                  class="inline-edit-btn save-btn"
                                  title="Save"
                                  type="submit"
                                  (click)="userForm().toggleEditing()"
                                >
                                  ✓
                                </button>
                                <button
                                  class="inline-edit-btn cancel-btn"
                                  type="button"
                                  title="Cancel"
                                  (click)="
                                    userForm().toggleEditing()
                                  "
                                >
                                  ✕
                                </button>
                              </div>
                            </form>
                            @if (
                              nameField().visibleExceptions().list.length > 0
                            ) {
                              <div class="field-errors">
                                @for (
                                  error of nameField().exceptions().list;
                                  track error.code
                                ) {
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
                          } @else {
                            <div class="inline-display">
                              <span [class.unsaved]="userForm().dirty() && !userForm().submitting()">{{ user.name }}</span>
                              @if (userForm().submitting()) {
                                <span class="spinner"></span>
                              } @else {
                                <button
                                  class="inline-edit-icon"
                                  title="Edit name"
                                  (click)="userForm().toggleEditing()"
                                >
                                  ✎
                                </button>
                              }
                            </div>
                          }

                          @if(userForm().hasExceptions()) {
                            @for(exception of  userForm().exceptions().submit; track exception.code) {
                              @let code = exception.code;
                              @switch (code) {
                                @case('HttpError') {
                                  <div class="field-errors">
                                    An error occurred while updating the user.
                                  </div>
                                }
                                @default never;
                              }

                            }
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
                      } @else if (usersByPage.status() === 'exception') {
                        <tr>
                          <td
                            colspan="5"
                            style="text-align: center; padding: 32px"
                          >
                            Exception
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
                  } @else if(usersByPage.isLoading()) {
                    <tr>
                      <td colspan="5" style="text-align: center; padding: 32px">
                        Loading...
                      </td>
                    </tr>
                  } @else {
                    <tr>
                      <td
                        colspan="5"
                        style="text-align: center; padding: 32px"
                      >
                        @for(exception of usersByPage.exceptions()?.list; track exception.code) {
                          @let code = exception.code;
                          @switch (code) {
                            @case('HttpError') {
                              <div>An error occurred while fetching users.</div>
                            }
                            @default never;
                          }
                        }
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
                [disabled]="usersByPage.disablePaginationWhileEditing()"
              >
                <option [value]="2">2</option>
                <option [value]="4">4</option>
                <option [value]="8">8</option>
                <option [value]="16">16</option>
              </select>
              <button [disabled]="usersByPage.disablePaginationWhileEditing()" class="btn" (click)="pagination.previousPage()">
                Previous
              </button>
              <span class="current-page">
                {{ pagination().page }}
              </span>
              <button [disabled]="usersByPage.disablePaginationWhileEditing()" class="btn" (click)="pagination.nextPage()">Next</button>
            </div>
            @if(usersByPage.disablePaginationWhileEditing()) {
              <div style="margin-top: 16px; color: red;">
                Pagination is disabled while editing, due to a current limitation/error from the Angular formField directive
              </div>
            }
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
  protected readonly apiService = injectApiService();

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
    loader: ({ params: user }) => this.apiService.updateItem(user),
  });

  private readonly updateUserName = mutation({
    method: (payload: NonNullable<ValidatedFormValue<User>>) => payload,
    identifier: ({ id }) => id,
    loader: async ({ params: user }) => this.apiService.updateItem(user),
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
    insertReactOnMutation(this.updateUserName, {
      filter: ({ mutationIdentifier, queryResource }) =>
        !!queryResource
          .safeValue()
          ?.some((item) => item.id === mutationIdentifier),
      optimisticUpdate: ({ queryResource, mutationParams }) =>
        updateOne({
          entities: queryResource.value(),
          update: {
            id: mutationParams.id,
            changes: mutationParams,
          },
        }),
      reload: {
        onMutationError: true,
      },
    }),
  );

  private readonly currentUsersPageResource = computed(() => {
    const currentIdentifier = this.usersQuery.currentIdentifier();
    if (!currentIdentifier) {
      return undefined;
    }

    return this.usersQuery.select(currentIdentifier);
  });

  protected readonly usersByPage = state(
    computed(() => this.usersQuery.currentPageData() ?? []),
    () => ({
      status: computed(() =>
        this.currentUsersPageResource()?.hasException()
          ? 'exception'
          : (this.currentUsersPageResource()?.status() ?? 'idle'),
      ),
      isLoading: computed(
        () => this.currentUsersPageResource()?.isLoading() ?? false,
      ),
      exceptions: computed(() => this.currentUsersPageResource()?.exceptions()),
      displayUsers: computed(() => !!this.usersQuery.currentPageData()?.length),
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
      () => {
        const isEditing = signal<boolean>(false);

        return {
          isEditing: isEditing.asReadonly(),
          toggleEditing: () => isEditing.update((v) => !v),
        };
      },
    ),
    ({ state, insertions: { select } }) => ({
      // due to a formField directive error, we need to disable pagination while editing
      disablePaginationWhileEditing: computed(() =>
        state().some(({ id }) => select(id)()?.isEditing()),
      ),
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
      isSelected: (id: string) => selectedRows().includes(id),
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

export type GenDeps_FullDemo = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
    FormField: FormField<any>;
    ApiService: GetInjectedServiceDependencies<typeof injectApiService>;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<FullDemo>;
}>;
