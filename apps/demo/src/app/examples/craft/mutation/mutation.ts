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
  craftComputed,
  craftMethod,
  craftService,
  insertStoragePersister,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
  state,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

export const { provideUserMutation, UserMutation } = craftService(
  { name: 'UserMutation', scope: 'toProvide' },
  function* (inputs: { userId: () => string | undefined }) {
    const updateUserName = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: function* ({ params: user }) {
        return yield* ApiService.updateItem(user);
      },
    });

    const user = yield* query(
      'user',
      {
        params: inputs.userId,
        loader: function* ({ params: userId }) {
          return yield* ApiService.getItemById(userId);
        },
        preservePreviousValue: () => true,
      },
      insertQueryPipe(
        insertStoragePersister({
          storeName: 'demo-app-craft',
          key: 'mutation',
        }),
        insertReactOnMutation(updateUserName, {
          optimisticPatch: {
            name: ({ mutationParams: { name } }) => name,
          },
        }),
      ),
    );

    return { user, updateUserName };
  },
);

const MutationCraft = craftComponent(
  'MutationCraft',
  {
    stylesUrl: styles,
    providers: [provideUserMutation()],
  },
  function* (userId: Input<string | undefined>) {
    const store = yield* UserMutation({ userId: () => userId() });
    const nameInput = yield* state('nameInput', '', ({ set }) => ({
      setName: (value: string) => set(value),
    }));
    const hasUser = craftComputed('hasUser', () => store.user.hasValue());
    const updateUserNameFn = craftMethod(
      'updateUserNameFn',
      function* (newName: string) {
        const { user, updateUserName } = yield* UserMutation(
          undefined,
          ({ user, updateUserName }) => ({ user, updateUserName }),
        );
        const userValue = user.value();
        if (userValue) {
          yield* updateUserName.mutate({
            userName: newName,
            user: userValue,
          });
        }
      },
    );
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const navigate = craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/mutation/:userId',
        params: { userId: String(Number(userId() ?? '0') + offset) },
      });
    });
    return {
      store,
      nameInput,
      setName: nameInput.setName,
      hasUser,
      updateUserNameFn,
      navigate,
    };
  },
  ({ store, nameInput, setName, hasUser, updateUserNameFn, navigate }) => {
    return div([
      div([
        'User ',
        StatusComponent({ status: () => store.user.status() }),
        ifBlock(hasUser, () =>
          pre('UserValue', {}, () =>
            JSON.stringify(store.user.value(), null, 2),
          ),
        ),
      ]),
      p('Reload to see the cached result; update the name optimistically.'),
      input('NameInput', {
        type: 'text',
        placeholder: 'New name',
        value: () => nameInput(),
        *input(event) {
          yield* setName((event.target as HTMLInputElement).value);
        },
      }),
      button(
        'UpdateUserNameButton',
        {
          class: 'update-user-name',
          disabled: () => store.updateUserName.isLoading(),
          *click() {
            const currentName = yield* nameInput();
            yield* updateUserNameFn(currentName ?? '');
          },
        },
        [
          'Update name ',
          StatusComponent({
            status: () => store.updateUserName.status(),
          }),
        ],
      ),
      button(
        'PreviousUser',
        {
          *click() {
            yield* navigate(-1);
          },
        },
        'Previous user',
      ),
      button(
        'NextUser',
        {
          *click() {
            yield* navigate(1);
          },
        },
        'Next user',
      ),
    ]);
  },
);

export default MutationCraft;
