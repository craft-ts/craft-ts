import { CommonModule } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { ApiService } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import { insertLocalStoragePersister, query } from '@ng-craft/core';

@Component({
  selector: 'app-no-store',
  imports: [CommonModule, StatusComponent],
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
    <button (click)="userQuery.persister.clearAllCache()">Clear cache</button>
  `,
})
export default class GlobalQuery {
  public readonly userId = input<string>();

  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly userQuery = query(
    {
      params: this.userId,
      loader: ({ params: userId }) => this.apiService.getItemById(userId),
      preservePreviousValue: () => true, // keep the previous user display while the new one fetching
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
