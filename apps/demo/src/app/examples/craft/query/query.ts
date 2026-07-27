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
  craftService,
  insertLocalStoragePersister,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';

const { UserQuery } = craftService(
  { name: 'UserQuery', scope: 'global' },
  function* (inputs: { userId: () => string | undefined }) {
    return (yield* query(
      'userQuery',
      {
        params: inputs.userId,
        loader: function* ({ params }) {
          yield* Console.log('Loading user with id:', params);
          return yield* ApiService.getItemById(params);
        },
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'user-query',
      }),
    )).userQuery;
  },
);

const CraftGlobalQuery = craftComponent(
  'CraftGlobalQuery',
  { providers: [provideHostName('component:CraftGlobalQuery')] },
  function* (userId: Input<string | undefined>) {
    componentMonitoring();
    const user = yield* UserQuery({ userId: () => userId() });
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const { navigate } = craftMethod('navigate', function* (offset: number) {
      // todo yield le router ici directement
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

export default CraftGlobalQuery;
