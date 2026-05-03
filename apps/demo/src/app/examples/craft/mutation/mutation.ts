import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertReactOnMutation,
  mutation,
  query,
  toValue,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
  type MaybeSignal,
} from '@craft-ng/core';
import { CraftRouterToYield } from '../../../shared/router.service';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';

const { injectUserMutation, provideUserMutation, UserMutationToYield } =
  craftService(
    { name: 'UserMutation', scope: 'toProvide' },
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
  imports: [JsonPipe, StatusComponent],
  providers: [provideUserMutation()],
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

  protected readonly store = injectUserMutation({
    userId: this.userId,
  });

  protected updateUserNameFn = craftMethod(function* (newName: string) {
    const { user, updateUserName } = yield* UserMutationToYield(
      undefined,
      ({ user, updateUserName }) => ({ user, updateUserName }),
    );
    const userValue = user.hasValue() ? user.value() : null;
    if (!userValue) {
      return;
    }
    updateUserName.mutate({ userName: newName, user: userValue });
  });

  protected nextPage = craftMethod(this, function* () {
    const router = yield* CraftRouterToYield(undefined, ({ navigate }) => ({
      navigate,
    }));
    router.navigate(['craft', 'mutation', parseInt(this.userId() ?? '0') + 1]);
  });

  protected previousPage = craftMethod(this, function* () {
    const router = yield* CraftRouterToYield(undefined, ({ navigate }) => ({
      navigate,
    }));
    router.navigate(['craft', 'mutation', parseInt(this.userId() ?? '10') - 1]);
  });
}

export type GenDeps_MutationCraft = GetDeps<{
  deps: {
    JsonPipe: JsonPipe;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
  };
  propertiesDeps: {
    userId: ExtractDeps<MutationCraft['userId']>;
    store: {
      UserMutation: ExtractDeps<typeof injectUserMutation>['UserMutation'];
    };
    updateUserNameFn: ExtractDeps<MutationCraft['updateUserNameFn']>;
    nextPage: ExtractDeps<MutationCraft['nextPage']>;
    previousPage: ExtractDeps<MutationCraft['previousPage']>;
  };
  provided: {
    UserMutation: ReturnType<typeof provideUserMutation>;
  };
  publicProperties: GetPublicComponentProperties<MutationCraft>;
}>;
