import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  craftService,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
  queryParam,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';
import { craftMethod } from '@craft-ng/core';

const {
  injectGranularMutation,
  provideGranularMutation,
  GranularMutationToYield,
} = craftService({ name: 'GranularMutation', scope: 'toProvide' }, () => {
  const pagination = queryParam(
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

  const updateUserName = mutation({
    method: (payload: User) => ({
      ...payload,
      name: payload.name + '-',
    }),
    identifier: ({ id }) => id,
    loader: function* ({ params: user }) {
      const { updateItem } = yield* ApiServiceToYield(
        {},
        ({ getDataList, updateItem }) => ({
          getDataList,
          updateItem,
        }),
      );
      return updateItem(user);
    },
  });

  const users = query(
    {
      params: pagination,
      identifier: (params) => `${params.page}-${params.pageSize}`,
      loader: function* ({ params: pagination }) {
        const { getDataList } = yield* ApiServiceToYield(
          {},
          ({ getDataList }) => ({ getDataList }),
        );
        return getDataList(pagination);
      },
    },
    insertLocalStoragePersister({
      storeName: 'demo-app-craft',
      key: 'granular',
    }),
    insertPaginationPlaceholderData,
    insertReactOnMutation(updateUserName, {
      filter: ({ mutationIdentifier, queryResource }) =>
        queryResource
          .safeValue()
          ?.some((item) => item.id === mutationIdentifier) ?? false,
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
  );

  return { pagination, users, updateUserName };
});

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
                            (click)="store.updateUserName.mutate(user)"
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
              <button class="btn" (click)="store.pagination.previousPage()">
                Previous
              </button>
              <span class="current-page">
                {{ store.pagination().page }}
              </span>
              <button class="btn" (click)="store.pagination.nextPage()">
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
  providers: [provideGranularMutation()],
})
export default class GranularMutationCraft {
  protected readonly store = injectGranularMutation();

  protected updatePageSize = craftMethod(function* (event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    const store = yield* GranularMutationToYield();
    store.pagination.updatePageSize(value);
    return;
  });
}

export type GenDeps_GranularMutationCraft = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
  };
  propertiesDeps: {
    store: {
      GranularMutation: ExtractDeps<
        typeof injectGranularMutation
      >['GranularMutation'];
    };
    updatePageSize: ExtractDeps<GranularMutationCraft['updatePageSize']>;
  };
  provided: {
    GranularMutation: ReturnType<typeof provideGranularMutation>;
  };
  publicProperties: GetPublicComponentProperties<GranularMutationCraft>;
}>;
