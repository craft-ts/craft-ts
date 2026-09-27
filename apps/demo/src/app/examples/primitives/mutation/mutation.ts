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
  craftService,
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
  craftUse,
  craftExpose, type CraftServiceInput } from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';

export const { MutationDemoView, provideMutationDemoView } = craftService(
  { name: 'mutationDemoView', providedIn: 'toProvide' },
  function* (inputs: { readonly userId: CraftServiceInput<string> }) {
    const { userId } = inputs;

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
          return yield* ApiService.getItemById(params);
        },
        preservePreviousValue: () => true,
      },
      insertQueryPipe(
        ({ resource }) => ({
          hasUser: craftUse(craftComputed('hasUser', () => resource.hasValue())),
          userValueJson: craftUse(craftComputed('userValueJson', function* () {
            return JSON.stringify(yield* resource.value(), null, 2);
          })),
        }),
        insertStoragePersister(
          craftUnique({
            storeName: 'demo-app',
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
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    yield* craftMethod('goTo', function* (offset: number) {
      void router.navigate({
        to: 'mutation/:userId',
        params: { userId: String(Number((yield* userId()) ?? '0') + offset) },
      });
    });
    yield* craftMethod('update', function* (name: string | undefined) {
      if (!name) {
        return;
      }
      const _userQueryvalue = yield* userQuery.value();
      const user = _userQueryvalue;
      if (user) {
        yield* updateUserName.mutate({
          userName: name,
          user,
        });
      }
    });

    yield* craftExpose('setName', nameInput.setName);
  },
);

const MutationDemoComponent = craftComponent(
  'MutationDemoComponent',
  {
    providers: [provideMutationDemoView()],
  },
  function* (inputs: { readonly userId: Input<string> }) {
    const { userQuery, updateUserName, update, goTo, nameInput, setName } =
      yield* MutationDemoView(inputs);

    return div({ class: example.card, 'data-exampleCard': 'dark' }, [
      heading({ class: example.title }, 'Update user'),
      div({ class: example.text }, [
        'User ',
        StatusComponent({ status: userQuery.status }),
        ifNode(userQuery.hasUser, () =>
          pre('UserValue', { class: example.code }, userQuery.userValueJson),
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
        value: nameInput,
        *input(event) {
          yield* setName(eventValue(event));
        },
      }),
      button(
        'UpdateUserNameButton',
        {
          type: 'button',
          class: example.button,
          'data-testid': 'update-user-name',
          disabled: updateUserName.isLoading,
          click: function* () {
            // This example intentionally demonstrates direct mutation wiring;
            // the form-based variant is covered by the full-demo example.
            // eslint-disable-next-line craft-ts/require-form-for-input-action
            update(yield* nameInput());
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
        {
          class: example.button,
          type: 'button',
          click: function* () {
            goTo(-1);
          },
        },
        'Previous user',
      ),
      button(
        'NextUser',
        {
          class: example.button,
          type: 'button',
          click: function* () {
            goTo(1);
          },
        },
        'Next user',
      ),
    ]);
  },
);

export default MutationDemoComponent;
