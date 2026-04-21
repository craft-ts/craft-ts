import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ApiServiceToYield, type User } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import {
  craftService,
  toCraftService,
  insertLocalStoragePersister,
  insertReactOnMutation,
  query,
  mutation,
  toValue,
  type MaybeSignal,
} from '@craft-ng/core';

const { injectRouter } = toCraftService({
  name: 'Router',
  scope: 'global',
  token: Router,
});

const { injectUserMutation } = craftService(
  { name: 'UserMutation', scope: 'global' },
  function* (inputs: { userId: MaybeSignal<string | undefined> }) {
    const { getItemById, updateItem } = yield* ApiServiceToYield(
      {},
      ({ getItemById, updateItem }) => ({ getItemById, updateItem }),
    );

    const updateUserName = mutation({
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: ({ params: user }) => updateItem(user),
    });

    const user = query(
      {
        params: () => toValue(inputs.userId),
        loader: ({ params: userId }) => getItemById(userId),
        preservePreviousValue: () => true,
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
    );

    return { user, updateUserName };
  },
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

  private readonly router = injectRouter(undefined, ({ navigate }) => ({
    navigate,
  }));

  protected readonly store = injectUserMutation({
    userId: this.userId,
  });

  protected updateUserNameFn(newName: string) {
    const user = this.store.user.hasValue() ? this.store.user.value() : null;
    if (!user) {
      return;
    }
    this.store.updateUserName.mutate({ userName: newName, user });
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
