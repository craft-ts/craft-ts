import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { injectApiService } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import {
  toCraftService,
  insertLocalStoragePersister,
  query,
} from '@craft-ng/core';

const { injectRouter } = toCraftService({
  name: 'Router',
  scope: 'global',
  token: Router,
});

@Component({
  selector: 'app-query',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['query.css'],
  template: `
    <div>
      User
      <app-status [status]="userQuery.status()" />

      :
      @if (userQuery.hasValue()) {
        <pre>{{ userQuery.value() | json }}</pre>
      }
    </div>

    <div>
      <p>
        > Reload the page to see the query result to be retrieved from the cache
      </p>
    </div>

    <button (click)="previousPage()">Previous user</button>
    <button (click)="nextPage()">Next user</button>
  `,
})
export default class GlobalQuery {
  public readonly userId = input<string>();

  private readonly apiService = injectApiService();
  private readonly router = injectRouter(undefined, ({ navigate }) => ({
    navigate,
  }));

  protected readonly userQuery = query(
    {
      params: this.userId,
      loader: ({ params: userId }) => this.apiService.getItemById(userId),
    },
    insertLocalStoragePersister({
      storeName: 'demo-app',
      key: 'user-query',
    }),
  );

  protected nextPage() {
    this.router.navigate(['query', parseInt(this.userId() ?? '0') + 1]);
  }

  protected previousPage() {
    this.router.navigate(['query', parseInt(this.userId() ?? '10') - 1]);
  }
}
