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
  craft,
  craftInject,
  craftInputs,
  craftQuery,
  craftMutations,
  insertLocalStoragePersister,
  insertReactOnMutation,
  query,
  mutation,
} from '@ng-craft/core';

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
  craftMutations(({ apiService }) => ({
    updateUserName: mutation({
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: ({ params: user }) => apiService.updateItem(user),
    }),
  })),
  craftQuery('user', ({ userId, apiService, updateUserName }) =>
    query(
      {
        params: userId,
        loader: ({ params: userId }) => apiService.getItemById(userId),
        preservePreviousValue: () => true, // keep the previous user display while the new one fetching
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'mutation',
      }),
      insertReactOnMutation(updateUserName, {
        optimisticPatch: {
          name: ({ mutationParams: { name } }) => name,
        },
      }),
    ),
  ),
);

@Component({
  selector: 'app-mutation',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['mutation.css'],
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
      <p>> Update the user name to see optimistic updates in action</p>
    </div>

    <input #nameInput type="text" placeholder="New name" />
    <button
      (click)="updateUserNameFn(nameInput.value)"
      [disabled]="store.updateUserName.isLoading()"
    >
      Update name (<app-status [status]="store.updateUserName.status()" />)
    </button>
  `,
})
export default class MutationCraft {
  public readonly userId = input<string>();

  private readonly router = inject(Router);

  protected readonly store = injectUserCraft({
    inputs: {
      userId: this.userId,
    },
  });

  protected updateUserNameFn(newName: string) {
    const user = this.store.user.hasValue() ? this.store.user.value() : null;
    if (!user) {
      return;
    }
    this.store.mutateUpdateUserName({ userName: newName, user });
  }

  protected nextPage() {
    this.router.navigate([
      'craft',
      'mutation',
      parseInt(this.userId() ?? '0') + 1,
    ]);
  }

  protected previousPage() {
    this.router.navigate([
      'craft',
      'mutation',
      parseInt(this.userId() ?? '10') - 1,
    ]);
  }
}
