import {
  button,
  component,
  div,
  h,
  input,
  p,
  type Input,
} from '@craft-ng/component';
import {
  craftUse,
  CraftRouterToYield,
  componentMonitoring,
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  insertReactOnMutation,
  craftPipe,
  mutation,
  provideHostName,
  query,
  type GetDeps,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';

const { injectUserMutation, provideUserMutation, UserMutationToYield } =
  craftService(
    { name: 'UserMutation', scope: 'toProvide' },
    (inputs: { userId: () => string | undefined }) => {
      const updateUserName = craftUse(
        mutation({
          method: (payload: { userName: string; user: User }) => ({
            ...payload.user,
            name: payload.userName,
          }),
          loader: function* ({ params: user }) {
            return yield* ApiServiceToYield.updateItem(user);
          },
        }),
      );

      const user = craftUse(
        query(
          {
            params: inputs.userId,
            loader: function* ({ params: userId }) {
              return yield* ApiServiceToYield.getItemById(userId);
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
        ),
      );

      return { user, updateUserName };
    },
  );

const MutationCraft = component(
  {
    providers: [
      provideUserMutation(),
      provideHostName('component:MutationCraft'),
    ],
  },
  (userId: Input<string | undefined>) => {
    componentMonitoring();
    const store = injectUserMutation({ userId: () => userId() });
    const updateUserNameFn = craftMethod(
      'updateUserNameFn',
      function* (newName: string) {
        const { user, updateUserName } = yield* UserMutationToYield(
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
    const navigate = (offset: number) =>
      craftMethod('navigate', function* () {
        const router = yield* CraftRouterToYield(
          undefined,
          ({ navigate }) => ({ navigate }),
        );
        void router.navigate({
          to: 'craft/mutation/:userId',
          params: { userId: String(Number(userId() ?? '0') + offset) },
        });
      })();
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

export type GenDeps_MutationCraft = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    UserMutation: ReturnType<typeof provideUserMutation>;
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
