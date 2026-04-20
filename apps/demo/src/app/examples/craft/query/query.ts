import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { ApiServiceToYield } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import {
  craftService,
  craftDependency,
  insertLocalStoragePersister,
  query,
  toValue,
  type MaybeSignal,
} from '@craft-ng/core';

const { injectRouter } = craftDependency({
  name: 'Router',
  scope: 'global',
  token: Router,
});

const { injectUserQuery } = craftService(
  { name: 'UserQuery', scope: 'global' },
  function* (inputs: { userId: MaybeSignal<string | undefined> }) {
    const { getItemById } = yield* ApiServiceToYield({}, ({ getItemById }) => ({
      getItemById,
    }));

    return query(
      {
        params: () => toValue(inputs.userId),
        loader: ({ params: userId }) => getItemById(userId),
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'user-query',
      }),
    );
  },
);

@Component({
  selector: 'app-query',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['query.css'],
  template: `
    <div>
      User
      <app-status [status]="user.status()" />

      :
      @if (user.hasValue()) {
        <pre>{{ user.value() | json }}</pre>
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

  private readonly router = injectRouter(undefined, ({ navigate }) => ({
    navigate,
  }));

  protected readonly user = injectUserQuery({
    userId: this.userId,
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
