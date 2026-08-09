import styles from './query.css' with { loader: 'text' };
import { computed } from '@angular/core';
import {
  button,
  craftComponent,
  div,
  h,
  ifBlock,
  p,
  type Input,
} from '@craft-ng/component';
import {
  Console,
  craftMethod,
  CraftRouter,
  insertLocalStoragePersister,
  insertQueryPipe,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';

const GlobalQuery = craftComponent(
  'GlobalQuery',
  {
    stylesUrl: styles,
  },
  function* (userId: Input<string | undefined>) {
    yield* Console.info('[query-demo] route input received', {
      userId: userId(),
    });
    const userQuery = yield* query(
      'userQuery',
      {
        params: userId,
        loader: function* ({ params }) {
          yield* Console.info('[query-demo] loader started', {
            inputUserId: userId(),
            params,
          });
          const user = yield* ApiService.getItemById(params);
          yield* Console.info('[query-demo] loader request created', {
            params,
          });
          return user;
        },
      },
      insertQueryPipe(
        ({ resource }) => ({ hasUser: computed(() => resource.hasValue()) }),
        insertLocalStoragePersister({
          storeName: 'demo-app',
          key: 'user-query',
        }),
      ),
    );
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const navigate = craftMethod('navigate', function* (offset: number) {
      const currentUserId = userId();
      const targetUserId = String(Number(currentUserId ?? '0') + offset);
      yield* Console.info('[query-demo] navigation requested', {
        currentUserId,
        offset,
        targetUserId,
      });
      void router.navigate({
        to: 'query/:userId',
        params: { userId: targetUserId },
      });
    });
    return { userQuery, navigate };
  },
  ({ userQuery, navigate }) => [
    div([
      'User ',
      StatusComponent({ status: () => userQuery.status() }),
      ifBlock(userQuery.hasUser, () =>
        h('pre', JSON.stringify(userQuery.value(), null, 2)),
      ),
    ]),
    p('Reload the page to retrieve the query result from the cache.'),
    button(
      {
        *click() {
          yield* navigate(-1);
        },
      },
      'Previous user',
    ),
    button(
      {
        *click() {
          yield* navigate(1);
        },
      },
      'Next user',
    ),
  ],
);

export default GlobalQuery;
