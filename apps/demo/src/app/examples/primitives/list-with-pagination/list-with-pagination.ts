import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ApiService } from './api.service';
import { StatusComponent } from '../../../ui/status.component';
import {
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  query,
  queryParam,
} from '@ng-craft/core';

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
})
export default class ListWithPagination {
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

  protected readonly usersQuery = query(
    {
      params: this.pagination,
      identifier: (params) => `${params.page}-${params.pageSize}`,
      loader: ({ params: pagination }) =>
        this.apiService.getDataList(pagination),
    },
    insertLocalStoragePersister({
      storeName: 'demo-app',
      key: 'list-with-pagination',
    }),
    insertPaginationPlaceholderData,
  );

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.pagination.updatePageSize(value);
  }
}
