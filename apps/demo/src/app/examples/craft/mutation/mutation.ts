import styles from './mutation.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  h,
  ifBlock,
  input,
  p,
  type Input,
} from '@craft-ng/component';
import {
  CraftRouter,
  craftComputed,
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertReactOnMutation,
  mutation,
  query,
  state,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const { provideUserMutation, UserMutation } = craftService(
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
    const nameInput = yield* state('nameInput', '');
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
          updateUserName.mutate({
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
    return { store, nameInput, hasUser, updateUserNameFn, navigate };
  },
  ({ store, nameInput, hasUser, updateUserNameFn, navigate }) => {
    return [
      div([
        'User ',
        StatusComponent({ status: () => store.user.status() }),
        ifBlock(hasUser, () =>
          h('pre', JSON.stringify(store.user.value(), null, 2)),
        ),
      ]),
      p('Reload to see the cached result; update the name optimistically.'),
      input({
        type: 'text',
        placeholder: 'New name',
        value: nameInput(),
        input: (event) =>
          nameInput.set((event.target as HTMLInputElement).value),
      }),
      button(
        {
          disabled: store.updateUserName.isLoading(),
          click: () => void updateUserNameFn(nameInput()),
        },
        [
          'Update name ',
          StatusComponent({
            status: () => store.updateUserName.status(),
          }),
        ],
      ),
      button({ click: () => void navigate(-1) }, 'Previous user'),
      button({ click: () => void navigate(1) }, 'Next user'),
    ];
  },
);

export default MutationCraft;
