import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  craftUse,
  componentMonitoring,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  provideHostName,
  craftPipe,
  query,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { injectDemoQueryParamsQueryParams } from '../../../app.routes';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { injectApiService, type User } from './api.service';

@Component({
  selector: 'app-list-with-pagination',
  imports: [StatusComponent],
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
                  </tr>
                </thead>
                <tbody>
                  @if (usersQuery.currentPageData()) {
                    @for (user of usersQuery.currentPageData(); track user.id) {
                      <tr>
                        <td>{{ user.id }}</td>

                        <td>{{ user.name }}</td>
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
  `,
  styleUrls: ['./list-with-pagination.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideHostName('component:QpListWithPagination')],
})
export default class QpListWithPagination {
  private readonly _monitoring = componentMonitoring();
  protected readonly pagination = injectDemoQueryParamsQueryParams();
  private readonly apiService = injectApiService();

  protected readonly usersQuery = craftUse(
    query(
      {
        params: this.pagination,
        identifier: (params) => `${params.page}-${params.pageSize}`,
        loader: ({ params: pagination }) =>
          this.apiService.getDataList(pagination),
      },
      (context) =>
        craftPipe(
          context,
          insertLocalStoragePersister({
            storeName: 'demo-app',
            key: 'list-with-pagination',
          }),
          insertPaginationPlaceholderData({ initialValue: [] as User[] }),
        ),
    ),
  );

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.pagination.updatePageSize(value);
  }
}

export type GenDeps_QpListWithPagination = GetDeps<{
  deps: {
    GenDeps_StatusComponent: GenDeps_StatusComponent;
  };
  propertiesDeps: {
    _monitoring: ExtractDeps<QpListWithPagination['_monitoring']>;
    pagination: {
      DemoQueryParamsQueryParams: ReturnType<
        typeof injectDemoQueryParamsQueryParams
      >;
    };
    apiService: {
      ApiService: ExtractDeps<typeof injectApiService>['ApiService'];
    };
    usersQuery: ExtractDeps<QpListWithPagination['usersQuery']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<QpListWithPagination>;
  missingProvider: {
    DemoQueryParamsQueryParams: ReturnType<
      typeof injectDemoQueryParamsQueryParams
    >;
  };
}>;
