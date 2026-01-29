import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import {
  asyncMethod,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
  queryParam,
} from '@ng-craft/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, User } from './api.service';

@Component({
  selector: 'app-granular-mutation',
  standalone: true,
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

            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  @if (usersQuery.currentPageData()) {
                    @for (user of usersQuery.currentPageData(); track user.id) {
                      <tr>
                        <td>{{ user.id }}</td>

                        <td>{{ user.name }}</td>

                        <td>
                          @let deleteUserRef = deleteUser.select(user.id);
                          status: {{ deleteUserRef?.status() }}/ ref
                          {{ !!deleteUserRef }}
                          @if (!deleteUserRef) {
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
                          @let delayDeleteUserRef =
                            delayUserDeletion.select(user.id);

                          @if (delayDeleteUserRef) {
                            @if (delayDeleteUserRef.status() === 'loading') {
                              <button
                                class="action-btn cancel-btn"
                                (click)="
                                  delayUserDeletion.method({
                                    user,
                                    action: 'cancel',
                                  })
                                "
                              >
                                Cancel Deletion
                              </button>
                            }
                          }
                        </td>
                      </tr>
                    } @empty {
                      @if (usersQuery.currentPageStatus() === 'resolved') {
                        <tr>
                          <td
                            colspan="4"
                            style="text-align: center; padding: 32px"
                          >
                            No users found
                          </td>
                        </tr>
                      } @else {
                        <tr>
                          <td
                            colspan="4"
                            style="text-align: center; padding: 32px"
                          >
                            Loading...
                          </td>
                        </tr>
                      }
                    }
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
    {{ testPrnt() | json }}

    1: {{ delayUserDeletion.select($any(1))?.status() }}/ "1":
    {{ delayUserDeletion.select('1')?.status() }}
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

  protected readonly delayUserDeletion = asyncMethod({
    method: (payload: { user: User; action: 'delete' | 'cancel' }) => payload,
    identifier: ({ user: { id } }) => id,
    loader: async ({ params: { user } }) => {
      await wait(3000);
      return user;
    },
  });

  protected readonly deleteUser = mutation({
    fromResourceById: this.delayUserDeletion._resourceById,
    params: (resource) => {
      const value = resource?.hasValue() ? resource?.value() : undefined;
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

  protected readonly usersQuery = query(
    {
      params: this.pagination,
      identifier: (params) => `${params.page}-${params.pageSize}`,
      loader: ({ params: pagination }) => {
        return this.apiService.getDataList(pagination);
      },
    },
    insertLocalStoragePersister({
      storeName: 'demo-app',
      key: 'granular',
    }),
    insertPaginationPlaceholderData,
    insertReactOnMutation(this.deleteUser, {
      filter: ({ mutationIdentifier, queryResource }) => {
        return (
          queryResource.hasValue() &&
          queryResource.value().some((item) => item.id === mutationIdentifier)
        );
      },
      optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
        queryResource.value()?.filter((item) => item.id !== mutationIdentifier),
    }),
  );

  _effect = effect(() => {
    console.log('delayUserDeletion', this.delayUserDeletion._resourceById());
  });

  testPrnt = computed(() =>
    Object.keys(this.delayUserDeletion._resourceById()),
  );

  _effect1 = effect(() => {
    console.log('delayUserDeletion 1', this.delayUserDeletion.select('1'));
  });

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.pagination.updatePageSize(value);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
