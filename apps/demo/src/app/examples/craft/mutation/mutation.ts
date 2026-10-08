import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  input,
  p,
  pre,
  withComponentProviders,
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
  craftExpose,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';

export const { provideUserMutation, UserMutation } = craftService(
  { name: 'UserMutation', providedIn: 'toProvide' },
  function* (inputs: {
    $provided: { readonly userId: CraftServiceInput<string> };
  }) {
    const updateUserName = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: function* ({ params: user }) {
        return yield* ApiService.updateItem(user);
      },
    });

    yield* query(
      'user',
      {
        params: inputs.$provided.userId,
        loader: function* ({ params: userId }) {
          return yield* ApiService.getItemById(userId);
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
  },
);

export const { MutationCraftView, provideMutationCraftView } = craftService(
  { name: 'mutationCraftView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly userId: CraftServiceInput<string> };
  }) {
    const { userId } = inputs.$provided;

    const store = yield* UserMutation();
    yield* state('nameInput', '', ({ set }) => ({
      setName: (value: string) => set(value),
    }));
    yield* craftComputed('hasUser', () => store.user.hasValue());
    yield* craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* store.user.value(), null, 2);
    });
    yield* craftMethod('updateUserNameFn', function* (newName: string) {
      const { user, updateUserName } = yield* UserMutation(
        {},
        ({ user, updateUserName }) => ({ user, updateUserName }),
      );
      const _uservalue = yield* user.value();
      const userValue = _uservalue;
      if (userValue) {
        yield* updateUserName.mutate({
          userName: newName,
          user: userValue,
        });
      }
    });
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    yield* craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/mutation/:userId',
        params: { userId: String(Number((yield* userId()) ?? '0') + offset) },
      });
    });
    yield* craftExpose('store', store);
  },
);

const MutationCraft = craftComponent(
  'MutationCraft',
  {},
  (_inputs: { readonly userId: Input<string> }) =>
    div({ class: example.card, 'data-exampleCard': 'dark' }, [
      heading({ class: example.title }, 'Update user'),
      div({ class: example.text }, [
        'User ',
        StatusComponent({
          status: function* () {
            const { store } = yield* MutationCraftView();
            return yield* store.user.status();
          },
        }),
        ifNode(
          'hasUser',
          function* () {
            const { hasUser } = yield* MutationCraftView();
            return yield* hasUser();
          },
          () =>
            pre('UserValue', { class: example.code }, function* () {
              const { userValueJson } = yield* MutationCraftView();
              return yield* userValueJson();
            }),
        ),
      ]),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Reload to see the cached result; update the name optimistically.',
      ),
      input('NameInput', {
        class: example.input,
        type: 'text',
        placeholder: 'New name',
        value: function* () {
          const { nameInput } = yield* MutationCraftView();
          return yield* nameInput();
        },
        *input(event) {
          yield* (yield* MutationCraftView()).nameInput.setName(eventValue(event));
        },
      }),
      button(
        'UpdateUserNameButton',
        {
          type: 'button',
          class: example.button,
          'data-testid': 'update-user-name',
          disabled: function* () {
            const { store } = yield* MutationCraftView();
            return yield* store.updateUserName.isLoading();
          },
          *click() {
            // This example intentionally demonstrates direct mutation wiring;
            // the form-based variant is covered by the full-demo example.
             
            (yield* MutationCraftView()).updateUserNameFn(
              (yield* (yield* MutationCraftView()).nameInput()) ?? '',
            );
          },
        },
        [
          'Update name ',
          StatusComponent({
            status: function* () {
              const { store } = yield* MutationCraftView();
              return yield* store.updateUserName.status();
            },
          }),
        ],
      ),
      button(
        'PreviousUser',
        {
          class: example.button,
          type: 'button',
          *click() {
            (yield* MutationCraftView()).navigate(-1);
          },
        },
        'Previous user',
      ),
      button(
        'NextUser',
        {
          class: example.button,
          type: 'button',
          *click() {
            (yield* MutationCraftView()).navigate(1);
          },
        },
        'Next user',
      ),
    ]),
).pipe(
  withComponentProviders(({ userId }) => [
    provideMutationCraftView({ userId }),
    provideUserMutation({ userId }),
  ]),
);

export default MutationCraft;
