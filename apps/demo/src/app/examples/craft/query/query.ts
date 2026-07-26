import { button, component, div, h, p, type Input } from '@craft-ng/component';
import {
  componentMonitoring,
  Console,
  craftMethod,
  CraftRouterToYield,
  craftService,
  insertLocalStoragePersister,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiServiceToYield } from './api.service';

const { UserQueryToYield } = craftService(
  { name: 'UserQuery', scope: 'global' },
  function* (inputs: { userId: () => string | undefined }) {
    return yield* query(
      {
        params: inputs.userId,
        loader: function* ({ params }) {
          yield* Console.log('Loading user with id:', params);
          return yield* ApiServiceToYield.getItemById(params);
        },
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'user-query',
      }),
    );
  },
);

const GlobalQuery = component(
  { providers: [provideHostName('component:GlobalQuery')] },
  function* (userId: Input<string | undefined>) {
    componentMonitoring();
    const user = yield* UserQueryToYield({ userId: () => userId() });
    const router = yield* CraftRouterToYield(undefined, ({ navigate }) => ({
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
    return { user, navigate };
  },
  ({ user, navigate }) => [
    div([
      'User ',
      StatusComponent({ status: () => user.status() }),
      user.hasValue() ? h('pre', JSON.stringify(user.value(), null, 2)) : [],
    ]),
    p('Reload the page to retrieve the query result from the cache.'),
    button({ click: () => void navigate(-1) }, 'Previous user'),
    button({ click: () => void navigate(1) }, 'Next user'),
  ],
);

export default GlobalQuery;
