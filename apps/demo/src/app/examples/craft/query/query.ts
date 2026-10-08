import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  pre,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import {
  Console,
  craftComputed,
  craftMethod,
  CraftRouter,
  craftService,
  insertStoragePersister,
  craftUnique,
  query,
  type CraftServiceInput,
  craftExpose,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';
import { example } from '../../shared/example.style';

const { UserQuery } = craftService(
  { name: 'UserQuery', providedIn: 'function' },
  function* (inputs: { userId: CraftServiceInput<string> }) {
    yield* query(
      'userQuery',
      {
        params: inputs.userId,
        loader: function* ({ params }) {
          yield* Console.log('Loading user with id:', params);
          return yield* ApiService.getItemById(params);
        },
      },
      insertStoragePersister(
        craftUnique({
          storeName: 'demo-app-craft',
          key: 'user-query',
        }),
      ),
    );
  },
);

export const { UserQueryView, provideUserQueryView } = craftService(
  { name: 'userQueryView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly userId: CraftServiceInput<string> };
  }) {
    const { userId } = inputs.$provided;

    const { userQuery: user } = yield* UserQuery({
      userId,
    });

    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    yield* craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/query/:userId',
        params: {
          userId: String(Number((yield* userId()) ?? '0') + offset),
        },
      });
    });
    yield* craftComputed('hasUser', () => user.hasValue());
    yield* craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* user.value(), null, 2);
    });
    yield* craftExpose('user', user);
  },
);

const CraftGlobalQuery = craftComponent(
  'CraftGlobalQuery',
  {},
  (_inputs: { readonly userId: Input<string> }) =>
    div({ class: example.card }, [
      heading({ class: example.title }, 'User query'),
      div({ class: example.result }, [
        'User ',
        StatusComponent({
          status: function* () {
            const { user } = yield* UserQueryView();
            return yield* user.status();
          },
        }),
        ifNode(
          'hasUser',
          function* () {
            const { hasUser } = yield* UserQueryView();
            return yield* hasUser();
          },
          () =>
            pre('QueryValue', { class: example.code }, function* () {
              const { userValueJson } = yield* UserQueryView();
              return yield* userValueJson();
            }),
        ),
      ]),
      p(
        { class: example.note },
        'Reload the page to retrieve the query result from the cache.',
      ),
      div({ class: example.actions, 'data-testid': 'query-actions' }, [
        button(
          'GoToPreviousUser',
          {
            class: example.button,
            type: 'button',
            *click() {
              (yield* UserQueryView()).navigate(-1);
            },
          },
          'Previous user',
        ),
        button(
          'GoToNextUser',
          {
            class: example.button,
            'data-exampleButton': 'primary',
            type: 'button',
            *click() {
              (yield* UserQueryView()).navigate(1);
            },
          },
          'Next user',
        ),
      ]),
    ]),
).pipe(
  withComponentProviders(({ userId }) => [provideUserQueryView({ userId })]),
);

export default CraftGlobalQuery;
