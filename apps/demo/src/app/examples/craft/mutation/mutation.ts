import {
  button,
  craftComponent,
  div,
  h,
  input,
  p,
  type Input,
} from '@craft-ng/component';
import {
  CraftRouter,
  componentMonitoring,
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertReactOnMutation,
  craftPipe,
  mutation,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const { provideUserMutation, UserMutation } = craftService(
  { name: 'UserMutation', scope: 'toProvide' },
  function* (inputs: { userId: () => string | undefined }) {
    const { updateUserName } = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: function* ({ params: user }) {
        return yield* ApiService.updateItem(user);
      },
    });

    const { user } = yield* query(
      'user',
      {
        params: inputs.userId,
        loader: function* ({ params: userId }) {
          return yield* ApiService.getItemById(userId);
        },
        preservePreviousValue: () => true,
      },
      (context) =>
        craftPipe(
          context,
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
    providers: [
      provideUserMutation(),
      provideHostName('component:MutationCraft'),
    ],
  },
  function* (userId: Input<string | undefined>) {
    componentMonitoring();
    const store = yield* UserMutation({ userId: () => userId() });
    const { updateUserNameFn } = craftMethod(
      'updateUserNameFn',
      function* (newName: string) {
        const { user, updateUserName } = yield* UserMutation(
          undefined,
          ({ user, updateUserName }) => ({ user, updateUserName }),
        );
        const userValue = user.safeValue();
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
    const { navigate } = craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/mutation/:userId',
        params: { userId: String(Number(userId() ?? '0') + offset) },
      });
    });
    return { store, updateUserNameFn, navigate };
  },
  ({ store, updateUserNameFn, navigate }) => {
    let nameInput: HTMLInputElement | undefined;
    return [
      div([
        'User ',
        StatusComponent({ status: () => store.user.status() }),
        store.user.hasValue()
          ? h('pre', JSON.stringify(store.user.value(), null, 2))
          : [],
      ]),
      p('Reload to see the cached result; update the name optimistically.'),
      input({
        type: 'text',
        placeholder: 'New name',
        input: (event) => {
          nameInput = event.target as HTMLInputElement;
        },
      }),
      button(
        {
          disabled: store.updateUserName.isLoading(),
          click: () => void updateUserNameFn(nameInput?.value ?? ''),
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
