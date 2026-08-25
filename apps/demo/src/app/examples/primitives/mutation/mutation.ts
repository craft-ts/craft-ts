/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './mutation.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  input,
  p,
  pre,
  type Input,
} from '@craft-ts/component';
import {
  CraftRouter,
  insertStoragePersister,
  craftUnique,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
  state,
  craftMethod,
  craftComputed,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

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
      setName: (value: string) => set(value.trim()),
    }));
    const userQuery = yield* query(
      'userQuery',
      {
        params: userId,
        loader: function* ({ params }) {
          return yield* ApiService.getItemById(params as string);
        },
        preservePreviousValue: () => true,
      },
      insertQueryPipe(
        ({ resource }) => ({
          hasUser: craftComputed('hasUser', () => resource.hasValue()),
        }),
        insertStoragePersister(craftUnique({
          storeName: 'demo-app',
          key: 'mutation',
        })),
        insertReactOnMutation(updateUserName, {
          optimisticPatch: {
            name: ({ mutationParams }: { mutationParams: { name: string } }) =>
              mutationParams.name,
          },
        }),
      ),
    );

    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    const goTo = craftMethod('goTo', function* (offset: number) {
      void router.navigate({
        to: 'mutation/:userId',
        params: { userId: String(Number((yield* userId()) ?? '0') + offset) },
      });
    });
    const update = craftMethod('update', function* (name: string | undefined) {
      if (!name) {
        return;
      }
        const _userQueryvalue = yield* userQuery.value();
      const user = _userQueryvalue;
      if (user) {
        yield* updateUserName.mutate({
          userName: name,
          user: user as User,
        });
      }
    });

    return {
      userQuery,
      updateUserName,
      update,
      goTo,
      nameInput,
      setName: nameInput.setName,
    };
  },
  ({ userQuery, updateUserName, update, goTo, nameInput, setName }) => {
    return div([
      heading('Update user'),
      div([
        'User ',
        StatusComponent({ status: userQuery.status }),
        ifNode(userQuery.hasUser, () =>
          pre('UserValue', {}, function* () {
            return JSON.stringify(yield* userQuery.value(), null, 2);
          }),
        ),
      ]),
      p('Reload to see the cached result; update the name optimistically.'),
      input('NameInput', {
        type: 'text',
        placeholder: 'New name',
        value: nameInput,
        *input(event) {
          yield* setName((event.target as HTMLInputElement).value);
        },
      }),
      button(
        'UpdateUserNameButton',
        { type: 'button',
          class: 'update-user-name',
          disabled: updateUserName.isLoading,
          click: function* () {
            yield* update(yield* nameInput());
          },
        },
        [
          'Update name ',
          StatusComponent({
            status: updateUserName.status,
          }),
        ],
      ),
      button(
        'PreviousUser',
        { type: 'button', click: function* () { yield* goTo(-1); } },
        'Previous user',
      ),
      button(
        'NextUser',
        { type: 'button', click: function* () { yield* goTo(1); } },
        'Next user',
      ),
    ]);
  },
);

export default MutationDemoComponent;
