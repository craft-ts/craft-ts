import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
    componentMonitoring,
    craftMethod,
    craftService,
    insertLocalStoragePersister,
    insertPaginationPlaceholderData,
    provideHostName,
    query,
    queryParam,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
} from '@craft-ng/core';
import {
    StatusComponent,
    type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';

const { injectUserList, provideUserList, UserListToYield } = craftService(
  { name: 'UserList', scope: 'toProvide' },
  () => {
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

    const users = query(
      {
        params: pagination,
        identifier: (params) => `${params.page}-${params.pageSize}`,
        loader: function* ({ params: pagination }) {
          return yield* ApiServiceToYield.getDataList(pagination);
        },
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'list-with-pagination',
      }),
      insertPaginationPlaceholderData(
        { initialValue: [] as User[] },
        ({ state }) => ({
          total: computed(() => state().length),
        }),
      ),
    );

    return { pagination, users };
  },
);

@Component({
  selector: 'app-list-with-pagination',
  imports: [CommonModule, StatusComponent],
  template: `
    <div class="container">
      <main class="content">
        <div class="content-wrapper">
          <div class="card">
            <h2 class="card-title">
              User Management:
              <app-status [status]="store.users.currentPageStatus()" />
              <span class="current-page">{{ store.users.total() }} on page</span>
            </h2>

            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
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
  styleUrls: ['./list-with-pagination.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideUserList(), provideHostName('component:ListWithPaginationCraft')],
})
export default class ListWithPaginationCraft {
  private readonly _monitoring = componentMonitoring();
  protected readonly store = injectUserList();

  protected updatePageSize = craftMethod('updatePageSize', function* (event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    const store = yield* UserListToYield();
    store.pagination.updatePageSize(value);
    return;
  });
}

export type GenDeps_ListWithPaginationCraft = GetDeps<{
      deps: {
        CommonModule: CommonModule;
        GenDeps_StatusComponent: GenDeps_StatusComponent;
      };
      propertiesDeps: {
        _monitoring: ExtractDeps<ListWithPaginationCraft["_monitoring"]>;
        store: {
            UserList: ExtractDeps<typeof injectUserList>["UserList"];
          };
        updatePageSize: ExtractDeps<ListWithPaginationCraft["updatePageSize"]>;
      };
      provided: {
        UserList: ReturnType<typeof provideUserList>;
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<ListWithPaginationCraft>;
    }>;
