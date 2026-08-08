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
  insertLocalStoragePersister,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

const MutationDemoComponent = craftComponent(
  'MutationDemoComponent',
  {
    stylesUrl: styles,
  },
  function* (userId: Input<string | undefined>) {
    const api = yield* ApiService();
    const updateUserName = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: function* ({ params: user }) {
        return yield* api.updateItem(user);
      },
    });
    const userQuery = yield* query(
      'userQuery',
      {
        params: userId,
        loader: function* ({ params }) {
          return yield* api.getItemById(params);
        },
        preservePreviousValue: () => true,
      },
      insertQueryPipe(
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
    const update = (name: string) => {
      const user = userQuery.value();
      if (user) {
        updateUserName.mutate({
          userName: name,
          user,
        });
      }
    };
    const hasUser = craftComputed('hasUser', () => userQuery.hasValue());
    return { userQuery, hasUser, updateUserName, update, goTo };
  },
  ({ userQuery, hasUser, updateUserName, update, goTo }) => {
    let name = '';
    return div([
      div([
        'User ',
        StatusComponent({ status: () => userQuery.status() }),
        ifBlock(hasUser, () =>
          h('pre', JSON.stringify(userQuery.value(), null, 2)),
        ),
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
      button({ click: () => goTo(-1) }, 'Previous user'),
      button({ click: () => goTo(1) }, 'Next user'),
    ]);
  },
);

export default MutationDemoComponent;
