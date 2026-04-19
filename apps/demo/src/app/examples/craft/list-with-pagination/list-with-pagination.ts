import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ApiServiceToYield } from './api.service';
import { StatusComponent } from '../../../ui/status.component';
import {
  craftService,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  query,
  queryParam,
} from '@craft-ng/core';

const { injectUserList, provideUserList } = craftService(
  { name: 'UserList', scope: 'toProvide' },
  function* () {
    const { getDataList } = yield* ApiServiceToYield({}, ({ getDataList }) => ({
      getDataList,
    }));

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
        loader: ({ params: pagination }) => getDataList(pagination),
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'list-with-pagination',
      }),
      insertPaginationPlaceholderData,
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
  providers: [provideUserList()],
})
export default class ListWithPaginationCraft {
  protected readonly store = injectUserList();

  protected updatePageSize(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    this.store.pagination.updatePageSize(value);
  }
}
