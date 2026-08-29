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
  craftComputed,
  craftMethod,
  craftService,
  insertStoragePersister,
  craftUnique,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
  state,
  type CraftServiceInput,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';

export const { provideUserMutation, UserMutation } = craftService(
  { name: 'UserMutation', providedIn: 'toProvide' },
  function* (inputs: { userId: CraftServiceInput<string | undefined> }) {
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
          return yield* ApiService.getItemById(userId as string);
        },
        preservePreviousValue: () => true,
      },
      insertQueryPipe(
        insertStoragePersister(
          craftUnique({
            storeName: 'demo-app-craft',
            key: 'mutation',
          }),
        ),
        insertReactOnMutation(updateUserName, {
          optimisticPatch: {
            name: ({ mutationParams }: { mutationParams: { name: string } }) =>
              mutationParams.name,
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
    const store = yield* UserMutation({
      userId,
    });
    const nameInput = yield* state('nameInput', '', ({ set }) => ({
      setName: (value: string) => set(value),
    }));
    const hasUser = craftComputed('hasUser', () => store.user.hasValue());
    const userValueJson = craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* store.user.value(), null, 2);
    });
    const updateUserNameFn = craftMethod(
      'updateUserNameFn',
      function* (newName: string) {
        const { user, updateUserName } = yield* UserMutation(
          undefined,
          ({ user, updateUserName }) => ({ user, updateUserName }),
        );
        const _uservalue = yield* user.value();
        const userValue = _uservalue;
        if (userValue) {
          yield* updateUserName.mutate({
            userName: newName,
            user: userValue as User,
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
        params: { userId: String(Number((yield* userId()) ?? '0') + offset) },
      });
    });
    return {
      store,
      nameInput,
      setName: nameInput.setName,
      hasUser,
      userValueJson,
      updateUserNameFn,
      navigate,
    };
  },
  ({
    store,
    nameInput,
    setName,
    hasUser,
    userValueJson,
    updateUserNameFn,
    navigate,
  }) => {
    return div([
      heading('Update user'),
      div([
        'User ',
        StatusComponent({ status: store.user.status }),
        ifNode(hasUser, () => pre('UserValue', {}, userValueJson)),
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
        {
          type: 'button',
          class: 'update-user-name',
          disabled: store.updateUserName.isLoading,
          *click() {
            yield* updateUserNameFn((yield* nameInput()) ?? '');
          },
        },
        [
          'Update name ',
          StatusComponent({
            status: store.updateUserName.status,
          }),
        ],
      ),
      button(
        'PreviousUser',
        {
          type: 'button',
          *click() {
            yield* navigate(-1);
          },
        },
        'Previous user',
      ),
      button(
        'NextUser',
        {
          type: 'button',
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
