import {
  button,
  craftComponent,
  div,
  h,
  p,
  type Input,
} from '@craft-ng/component';
import {
  componentMonitoring,
  Console,
  craftMethod,
  CraftRouter,
  insertLocalStoragePersister,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';

const GlobalQuery = craftComponent(
  'GlobalQuery',
  {
    providers: [provideHostName('component:GlobalQuery')],
  },
  function* (userId: Input<string | undefined>) {
    componentMonitoring();
    yield* Console.info('[query-demo] route input received', {
      userId: userId(),
    });
    const { userQuery } = yield* query(
      'userQuery',
      {
        params: userId,
        loader: function* ({ params }) {
          yield* Console.info('[query-demo] loader started', {
            inputUserId: userId(),
            params,
          });
          const userPromise = yield* ApiService.getItemById(params);
          yield* Console.info('[query-demo] loader request created', {
            params,
          });
          return userPromise;
        },
      },
      insertLocalStoragePersister({
        storeName: 'demo-app',
        key: 'user-query',
      }),
    );
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const { navigate } = craftMethod('navigate', function* (offset: number) {
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
      userQuery.hasValue()
        ? h('pre', JSON.stringify(userQuery.value(), null, 2))
        : [],
    ]),
    p('Reload the page to retrieve the query result from the cache.'),
    button({ click: () => void navigate(-1) }, 'Previous user'),
    button({ click: () => void navigate(1) }, 'Next user'),
  ],
);

export default GlobalQuery;
