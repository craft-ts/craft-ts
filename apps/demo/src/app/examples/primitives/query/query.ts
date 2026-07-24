import {
  button,
  component,
  div,
  h,
  p,
  type Input,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftMethod,
  CraftRouterToYield,
  craftUse,
  insertLocalStoragePersister,
  provideHostName,
  query,
  type GetDeps,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiServiceToYield } from './api.service';

const GlobalQuery = component(
  {
    providers: [provideHostName('component:GlobalQuery')],
  },
  (userId: Input<string | undefined>) => {
    componentMonitoring();
    const userQuery = craftUse(
      query(
        {
          params: userId,
          loader: function* ({ params }) {
            return yield* ApiServiceToYield.getItemById(params);
          },
        },
        insertLocalStoragePersister({
          storeName: 'demo-app',
          key: 'user-query',
        }),
      ),
    );
    const navigate = (offset: number) =>
      craftMethod('navigate', function* () {
        yield* CraftRouterToYield.navigate({
          to: 'query/:userId',
          params: {
            userId: String(Number(userId() ?? '0') + offset),
          },
        });
      })();
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

export type GenDeps_GlobalQuery = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
