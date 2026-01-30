import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { ApiService, User } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import {
  query,
  mutation,
  insertLocalStoragePersister,
  insertReactOnMutation,
} from '@ng-angular-stack/craft';

@Component({
  selector: 'app-mutation',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['mutation.css'],
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
      <p>> Update the user name to see optimistic updates in action</p>
    </div>

    <input #nameInput type="text" placeholder="New name" />
    <button
      (click)="updateUserNameFn(nameInput.value)"
      [disabled]="updateUserName.isLoading()"
    >
      Update name (<app-status [status]="updateUserName.status()" />)
    </button>
  `,
})
export default class GlobalQuery {
  public readonly userId = input<string>();
  private readonly apiService = inject(ApiService);

  protected readonly updateUserName = mutation({
    method: (payload: { userName: string; user: User }) => ({
      ...payload.user,
      name: payload.userName,
    }),
    loader: ({ params: user }) => this.apiService.updateItem(user),
  });

  protected readonly userQuery = query(
    {
      params: this.userId,
      loader: ({ params: userId }) => this.apiService.getItemById(userId),
      preservePreviousValue: () => true, // keep the previous user display while the new one fetching
    },
    insertLocalStoragePersister({
      storeName: 'demo-app',
      key: 'mutation',
    }),
    insertReactOnMutation(this.updateUserName, {
      optimisticPatch: {
        name: ({ mutationParams: { name } }) => name,
      },
    }),
  );

  private readonly router = inject(Router);

  protected updateUserNameFn(newName: string) {
    const user = this.userQuery.hasValue() ? this.userQuery.value() : null;
    if (!user) {
      return;
    }
    this.updateUserName.mutate({ userName: newName, user });
  }

  protected nextPage() {
    this.router.navigate(['mutation', parseInt(this.userId() ?? '0') + 1]);
  }

  protected previousPage() {
    this.router.navigate(['mutation', parseInt(this.userId() ?? '10') - 1]);
  }
}
