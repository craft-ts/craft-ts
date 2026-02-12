import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { ApiService } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import {
  craft,
  craftInject,
  craftInputs,
  craftQuery,
  insertLocalStoragePersister,
  query,
} from '@craft-ng/core';

const { injectUserCraft } = craft(
  {
    name: 'user',
    providedIn: 'root',
  },
  craftInputs({
    userId: undefined as string | undefined,
  }),
  craftInject(() => ({
    ApiService,
  })),
  craftQuery('user', ({ userId, apiService }) =>
    query(
      {
        params: userId,
        loader: ({ params: userId }) => apiService.getItemById(userId),
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'user-query',
      }),
    ),
  ),
);

@Component({
  selector: 'app-query',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['query.css'],
  template: `
    <div>
      User
      <app-status [status]="store.user.status()" />

      :
      @if (store.user.hasValue()) {
        <pre>{{ store.user.value() | json }}</pre>
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

  private readonly router = inject(Router);

  protected readonly store = injectUserCraft({
    inputs: {
      userId: this.userId,
    },
  });

  protected nextPage() {
    this.router.navigate([
      'craft',
      'query',
      parseInt(this.userId() ?? '0') + 1,
    ]);
  }

  protected previousPage() {
    this.router.navigate([
      'craft',
      'query',
      parseInt(this.userId() ?? '10') - 1,
    ]);
  }
}
