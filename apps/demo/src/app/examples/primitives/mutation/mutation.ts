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
  componentMonitoring,
  craftPipe,
  craftUse,
  injectCraftRouter,
  insertLocalStoragePersister,
  insertReactOnMutation,
  mutation,
  provideHostName,
  query,
  type GetDeps,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { injectApiService, type User } from './api.service';

const MutationDemoComponent = component(
  { providers: [provideHostName('component:MutationDemoComponent')] },
  (userId: Input<string | undefined>) => {
    componentMonitoring();
    const api = injectApiService();
    const updateUserName = craftUse(
      mutation({
        method: (payload: { userName: string; user: User }) => ({
          ...payload.user,
          name: payload.userName,
        }),
        loader: ({ params: user }) => api.updateItem(user),
      }),
    );
    const userQuery = craftUse(
      query(
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
      ),
    );
    const router = injectCraftRouter(undefined, ({ navigate }) => ({
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
export type GenDeps_GlobalQuery = GenDeps_MutationDemoComponent;
export type GenDeps_MutationDemoComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
  missingProvider: {
    CraftRouter: ReturnType<typeof injectCraftRouter>;
  };
}>;
