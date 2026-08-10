import styles from './query.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  ifBlock,
  p,
  pre,
  type Input,
} from '@craft-ng/component';
import {
  Console,
  craftComputed,
  craftMethod,
  CraftRouter,
  craftService,
  insertStoragePersister,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';

const { UserQuery } = craftService(
  { name: 'UserQuery', scope: 'global' },
  function* (inputs: { userId: () => string | undefined }) {
    return yield* query(
      'userQuery',
      {
        params: inputs.userId,
        loader: function* ({ params }) {
          yield* Console.log('Loading user with id:', params);
          return yield* ApiService.getItemById(params);
        },
      },
      insertStoragePersister({
        storeName: 'demo-app-craft',
        key: 'user-query',
      }),
    );
  },
);

const CraftGlobalQuery = craftComponent(
  'CraftGlobalQuery',
  {
    stylesUrl: styles,
  },
  function* (userId: Input<string | undefined>) {
    const user = yield* UserQuery({ userId: () => userId() });

    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    const navigate = craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/query/:userId',
        params: {
          userId: String(Number(userId() ?? '0') + offset),
        },
      });
    });
    const hasUser = craftComputed('hasUser', () => user.hasValue());
    return { user, hasUser, navigate };
  },
  ({ user, hasUser, navigate }) => [
    div([
      'User ',
      StatusComponent({ status: () => user.status() }),
      ifBlock(hasUser, () =>
        pre('QueryValue', {}, () => JSON.stringify(user.value(), null, 2)),
      ),
    ]),
    p('Reload the page to retrieve the query result from the cache.'),
    div(
      { class: 'query-actions' },
      [
        button(
          'GoToPreviousUser',
          {
            *click() {
              yield* navigate(-1);
            },
          },
          'Previous user',
        ),
        button(
          'GoToNextUser',
          {
            *click() {
              yield* navigate(1);
            },
          },
          'Next user',
        ),
      ],
    ),
  ],
);

export default CraftGlobalQuery;
