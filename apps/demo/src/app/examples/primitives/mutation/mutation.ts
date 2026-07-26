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
  CraftRouterToYield,
  componentMonitoring,
  craftPipe,
  insertLocalStoragePersister,
  insertReactOnMutation,
  mutation,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiServiceToYield, type User } from './api.service';

const MutationDemoComponent = craftComponent(
  'MutationDemoComponent',
  { providers: [provideHostName('component:MutationDemoComponent')] },
  function* (userId: Input<string | undefined>) {
    componentMonitoring();
    const api = yield* ApiServiceToYield();
    const updateUserName = yield* mutation({
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: ({ params: user }) => api.updateItem(user),
    });
    const userQuery = yield* query(
      {
        params: userId,
        loader: ({ params }) => api.getItemById(params),
        preservePreviousValue: () => true,
      },
      (context) =>
        craftPipe(
          context,
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
    const router = yield* CraftRouterToYield(undefined, ({ navigate }) => ({
      navigate,
    }));
    const navigate = (offset: number) =>
      void router.navigate({
        to: 'mutation/:userId',
        params: { userId: String(Number(userId() ?? '0') + offset) },
      });
    const update = (name: string) => {
      const user = userQuery.safeValue();
      if (user) {
        updateUserName.mutate({
          userName: name,
          user,
        });
      }
    };
    return { userQuery, updateUserName, update, navigate };
  },
  ({ userQuery, updateUserName, update, navigate }) => {
    let name = '';
    return [
      div([
        'User ',
        StatusComponent({ status: () => userQuery.status() }),
        userQuery.hasValue()
          ? h('pre', JSON.stringify(userQuery.value(), null, 2))
          : [],
      ]),
      p('Reload to see the cached result; update the name optimistically.'),
      input({
        type: 'text',
        placeholder: 'New name',
        input: (event) => {
          name = (event.target as HTMLInputElement).value;
        },
      }),
      button(
        {
          disabled: updateUserName.isLoading(),
          click: () => update(name),
        },
        [
          'Update name ',
          StatusComponent({ status: () => updateUserName.status() }),
        ],
      ),
      button({ click: () => navigate(-1) }, 'Previous user'),
      button({ click: () => navigate(1) }, 'Next user'),
    ];
  },
);

export default MutationDemoComponent;
