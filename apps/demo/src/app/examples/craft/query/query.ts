import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  pre,
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
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';
import { example } from '../../shared/example.style';

const { UserQuery } = craftService(
  { name: 'UserQuery', providedIn: 'global' },
  function* (inputs: { userId: CraftServiceInput<string> }) {
    return yield* query(
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

const CraftGlobalQuery = craftComponent(
  'CraftGlobalQuery',
  {},
  function* (userId: Input<string>) {
    const user = yield* UserQuery({
      userId,
    });

    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    const navigate = craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/query/:userId',
        params: {
          userId: String(Number((yield* userId()) ?? '0') + offset),
        },
      });
    });
    const hasUser = craftComputed('hasUser', () => user.hasValue());
    const userValueJson = craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* user.value(), null, 2);
    });
    return { user, hasUser, userValueJson, navigate };
  },
  ({ user, hasUser, userValueJson, navigate }) =>
    div({ class: example.card }, [
      heading({ class: example.title }, 'User query'),
      div({ class: example.result }, [
        'User ',
        StatusComponent({ status: user.status }),
        ifNode(hasUser, () =>
          pre('QueryValue', { class: example.code }, userValueJson),
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
              yield* navigate(-1);
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
              yield* navigate(1);
            },
          },
          'Next user',
        ),
      ]),
    ]),
);

export default CraftGlobalQuery;
