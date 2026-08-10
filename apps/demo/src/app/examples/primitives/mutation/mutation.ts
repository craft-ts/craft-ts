import styles from './mutation.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  ifBlock,
  input,
  p,
  pre,
  type Input,
} from '@craft-ng/component';
import {
  CraftRouter,
  insertLocalStoragePersister,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
  state,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { computed } from '@angular/core';

const MutationDemoComponent = craftComponent(
  'MutationDemoComponent',
  {
    stylesUrl: styles,
  },
  function* (userId: Input<string | undefined>) {
    const updateUserName = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: function* ({ params: user }) {
        return yield* ApiService.updateItem(user);
      },
    });
    const nameInput = yield* state('nameInput', '', ({ set }) => ({
      setName: (value: string) => set(value),
    }));
    const userQuery = yield* query(
      'userQuery',
      {
        params: userId,
        loader: function* ({ params }) {
          return yield* ApiService.getItemById(params);
        },
        preservePreviousValue: () => true,
      },
      insertQueryPipe(
        ({ resource }) => ({ hasUser: computed(() => resource.hasValue()) }),
        insertLocalStoragePersister({
          storeName: 'demo-app',
          key: 'mutation',
        }),
        insertReactOnMutation(updateUserName, {
          optimisticPatch: {
            name: ({ mutationParams: { name } }) => name,
          },
        }),
      ),
    );

    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    const goTo = (offset: number) => {
      void router.navigate({
        to: 'mutation/:userId',
        params: { userId: String(Number(userId() ?? '0') + offset) },
      });
    };
    const update = function* (name: string) {
      const user = userQuery.value();
      if (user) {
        yield* updateUserName.mutate({
          userName: name,
          user,
        });
      }
    };
    return {
      userQuery,
      updateUserName,
      update,
      goTo,
      nameInput,
      setName: nameInput.setName,
    };
  },
  ({
    userQuery,
    updateUserName,
    update,
    goTo,
    nameInput,
    setName,
  }) => {
    return div([
      div([
        'User ',
        StatusComponent({ status: () => userQuery.status() }),
        ifBlock(userQuery.hasUser, () =>
          pre('UserValue', {}, JSON.stringify(userQuery.value(), null, 2)),
        ),
      ]),
      p('Reload to see the cached result; update the name optimistically.'),
      input('NameInput', {
        type: 'text',
        placeholder: 'New name',
        value: nameInput(),
        *input(event) {
          yield* setName((event.target as HTMLInputElement).value);
        },
      }),
      button(
        'UpdateUserNameButton',
        {
          class: 'update-user-name',
          disabled: updateUserName.isLoading(),
          click: function* () {
            const currentName = yield* nameInput();
            yield* update(currentName ?? '');
          },
        },
        [
          'Update name ',
          StatusComponent({ status: () => updateUserName.status() }),
        ],
      ),
      button('PreviousUser', { click: () => goTo(-1) }, 'Previous user'),
      button('NextUser', { click: () => goTo(1) }, 'Next user'),
    ]);
  },
);

export default MutationDemoComponent;
