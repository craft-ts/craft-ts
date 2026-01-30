import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  craft,
  craftInject,
  craftQueryParam,
  craftMutations,
  craftQuery,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
  queryParam,
} from '@ng-craft/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, User } from './api.service';

const { injectGranularMutationCraft, provideGranularMutationCraft } = craft(
  {
    name: 'granularMutation',
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
    updateUserName: mutation({
      method: (payload: User) => ({
        ...payload,
        name: payload.name + '-',
      }),
      identifier: ({ id }) => id,
      loader: ({ params: user }) => apiService.updateItem(user),
    }),
  })),
  craftQuery('users', ({ pagination, apiService, updateUserName }) =>
    query(
      {
        params: pagination,
        identifier: (params) => `${params.page}-${params.pageSize}`,
        loader: ({ params: pagination }) => {
          return apiService.getDataList(pagination);
        },
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'granular',
      }),
      insertPaginationPlaceholderData,
      insertReactOnMutation(updateUserName, {
        filter: ({ mutationIdentifier, queryResource }) =>
          queryResource.hasValue() &&
          queryResource.value().some((item) => item.id === mutationIdentifier),
        optimisticUpdate: ({
          queryResource,
          mutationIdentifier,
          mutationParams,
        }) => {
          return queryResource.value()?.map((item) => {
            return item.id === mutationIdentifier ? mutationParams : item;
          });
        },
      }),
    ),
  ),
);

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
              <app-status [status]="store.users.currentPageStatus()" />
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
                  @if (store.users.currentPageData()) {
                    @for (
                      user of store.users.currentPageData();
                      track user.id
                    ) {
                      <tr>
                        <td>{{ user.id }}</td>

                        <td>{{ user.name }}</td>

                        <td>
                          <button
                            class="action-btn"
                            (click)="store.mutateUpdateUserName(user)"
                            [disabled]="
                              store.updateUserName.select(user.id)?.isLoading()
                            "
                          >
                            Update Name
                            @if (
                              store.updateUserName.select(user.id)?.status() &&
                              store.updateUserName.select(user.id)?.status() !==
                                'idle'
                            ) {
                              <app-status
                                [status]="
                                  store.updateUserName
                                    .select(user.id)
                                    ?.status() ?? 'idle'
                                "
                              ></app-status>
                            }
                          </button>
                        </td>
                      </tr>
                    } @empty {
                      @if (store.users.currentPageStatus() === 'resolved') {
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
  styleUrls: ['./granular-mutation.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideGranularMutationCraft()],
})
export default class GranularMutationCraft {
  protected readonly store = injectGranularMutationCraft({});

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.store.updatePageSizePagination(value);
  }
}
