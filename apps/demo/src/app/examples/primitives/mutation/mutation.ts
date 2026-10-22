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
  craftService,
  insertStoragePersister,
  craftUnique,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
  state,
  craftMethod,
  craftComputed,
  type CraftServiceInput,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService, type User } from './api.service';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';
import { buttonUi } from '@craft-ts/ui/style';
import { UserIdPathParams } from '../../shared/user-id-path-params';

export const { MutationDemoView, provideMutationDemoView } = craftService(
  { name: 'mutationDemoView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly userId: CraftServiceInput<string> };
  }) {
    const { userId } = inputs.$provided;

    const updateUserName = yield* mutation('updateUserName', {
      method: (payload: { userName: string; user: User }) => ({
        ...payload.user,
        name: payload.userName,
      }),
      loader: function* ({ params: user }) {
        return yield* ApiService.updateItem(user);
      },
    });
    yield* state('nameInput', '', ({ set }) => ({
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
    yield* craftComputed('hasUser', () => userQuery.hasValue());
    yield* craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* userQuery.value(), null, 2);
    });
    const userIdPathParams = yield* UserIdPathParams();
    yield* craftMethod('goTo', function* (offset: number) {
      return yield* userIdPathParams.shiftUser(offset);
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

  },
);

const MutationDemoComponent = craftComponent(
  'MutationDemoComponent',
  {},
  (_inputs: { readonly userId: Input<string> }) =>
    div({ class: example.card, 'data-exampleCard': 'dark' }, [
      heading({ class: example.title }, 'Update user'),
      div({ class: example.text }, [
        'User ',
        StatusComponent({
          status: function* () {
            const { userQuery } = yield* MutationDemoView();
            return yield* userQuery.status();
          },
        }),
        ifNode(
          'hasUser',
          function* () {
            const { hasUser } = yield* MutationDemoView();
            return yield* hasUser();
          },
          () =>
            pre('UserValue', { class: example.code }, function* () {
              const { userValueJson } = yield* MutationDemoView();
              return yield* userValueJson();
            }),
        ),
      ]),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Reload to see the cached result; update the name optimistically.',
      ),
      div({ class: example.row }, [
        input('NameInput', {
          class: example.input,
          type: 'text',
          placeholder: 'New name',
          value: function* () {
            const { nameInput } = yield* MutationDemoView();
            return yield* nameInput();
          },
          *input(event) {
            yield* (yield* MutationDemoView()).nameInput.setName(eventValue(event));
          },
        }),
        button(
          'UpdateUserNameButton',
          {
            type: 'button',
            class: buttonUi.root, 'data-variant': 'secondary',
            'data-testid': 'update-user-name',
            disabled: function* () {
              const { updateUserName } = yield* MutationDemoView();
              return yield* updateUserName.isLoading();
            },
            click: function* () {
              // This example intentionally demonstrates direct mutation wiring;
              // the form-based variant is covered by the full-demo example.
             
              (yield* MutationDemoView()).update(
                yield* (yield* MutationDemoView()).nameInput(),
              );
            },
          },
          [
            'Update name ',
            StatusComponent({
              status: function* () {
                const { updateUserName } = yield* MutationDemoView();
                return yield* updateUserName.status();
              },
            }),
          ],
        ),
      ]),
      div({ class: example.actions }, [
        button(
          'PreviousUser',
          {
            class: buttonUi.root, 'data-variant': 'secondary',
            type: 'button',
            click: function* () {
              (yield* MutationDemoView()).goTo(-1);
            },
          },
          'Previous user',
        ),
        button(
          'NextUser',
          {
            class: buttonUi.root, 'data-variant': 'secondary',
            type: 'button',
            click: function* () {
              (yield* MutationDemoView()).goTo(1);
            },
          },
          'Next user',
        ),
      ]),
    ]),
).pipe(
  withComponentProviders(({ userId }) => [provideMutationDemoView({ userId })]),
);

export default MutationDemoComponent;
