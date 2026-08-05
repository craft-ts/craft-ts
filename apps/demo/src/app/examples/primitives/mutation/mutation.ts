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
  craftPipe,
  insertLocalStoragePersister,
  insertReactOnMutation,
  mutation,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const MutationDemoComponent = craftComponent(
  'MutationDemoComponent',
  {
    styles: `
      :scope{display:block;max-width:420px;margin:2.5rem auto;padding:2.2rem 2rem 2rem;background:#232323;border-radius:14px;box-shadow:0 2px 16px rgba(0,0,0,.12);color:#eaeaea}
      button{background:#444;color:#eaeaea;border:none;border-radius:7px;padding:.6rem 1.2rem;font-size:1rem;cursor:pointer;margin-bottom:1.2rem;margin-right:1rem;transition:background .2s;box-shadow:0 1px 4px rgba(0,0,0,.08)}
      button:hover{background:#2a2a2a}
      input[type=text]{background:#2a2a2a;color:#eaeaea;border:1px solid #444;border-radius:7px;padding:.6rem 1rem;font-size:1rem;width:100%;max-width:300px;margin-bottom:1rem;margin-right:.8rem;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.08)}
      input[type=text]:focus{outline:none;border-color:#666;background:#333;box-shadow:0 0 0 3px rgba(68,68,68,.3)}
      pre{background:#181818;color:#d6d6d6;border-radius:8px;padding:1rem;font-size:.98rem;overflow-x:auto;margin:1.2rem 0;box-shadow:0 1px 4px rgba(0,0,0,.1)}
    `,
  },
  function* (userId: Input<string | undefined>) {
    const api = yield* ApiService();
    const { updateUserName } = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: ({ params: user }) => api.updateItem(user),
    });
    const { userQuery } = yield* query(
      'userQuery',
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
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
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
    return div([
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
    ]);
  },
);

export default MutationDemoComponent;
