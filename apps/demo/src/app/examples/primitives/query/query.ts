/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './query.css' with { loader: 'text' };
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
  craftMethod,
  CraftRouter,
  insertStoragePersister,
  craftUnique,
  insertQueryPipe,
  query,
  craftComputed,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';

const GlobalQuery = craftComponent(
  'GlobalQuery',
  {
    stylesUrl: styles,
    cssVars: {
      '--query-ink': '#172033',
      '--query-muted': '#64748b',
      '--query-border': '#dce4ef',
      '--query-accent': '#2563eb',
      '--query-accent-dark': '#1d4ed8',
    },
  },
  function* (userId: Input<string | undefined>) {
    const userQuery = yield* query(
      'userQuery',
      {
        params: userId,
        preservePreviousValue: () => true,
        loader: function* ({ params }) {
          return yield* ApiService.getItemById(params as string);
        },
      },
      insertQueryPipe(
        ({ resource }) => ({
          hasUser: craftComputed('hasUser', () => resource.hasValue()),
        }),
        insertStoragePersister(craftUnique({
          storeName: 'demo-app',
          key: 'user-query',
        })),
      ),
    );
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const navigateNext = craftMethod('navigateNext', function* () {
      const currentUserId = yield* userId();
      const targetUserId = String(Number(currentUserId ?? '0') + 1);
      void router.navigate({
        to: 'query/:userId',
        params: { userId: targetUserId },
      });
    });
    const navigatePrevious = craftMethod('navigatePrevious', function* () {
      const currentUserId = yield* userId();
      const targetUserId = String(Number(currentUserId ?? '0') - 1);
      void router.navigate({
        to: 'query/:userId',
        params: { userId: targetUserId },
      });
    });
    return { userQuery, navigateNext, navigatePrevious };
  },
  ({ userQuery, navigateNext, navigatePrevious }) =>
    div({ class: 'query-shell' }, [
      heading('User query'),
      div({ class: 'query-result' }, [
        'User ',
        StatusComponent({ status: userQuery.status }),
        ifNode(userQuery.hasUser, () =>
          pre('QueryValue', {}, function* () {
            return JSON.stringify(yield* userQuery.value(), null, 2);
          }),
        ),
      ]),
      p(
        { class: 'query-note' },
        'Reload the page to retrieve the query result from the cache.',
      ),
      div({ class: 'query-actions' }, [
        button(
          'GoToPreviousUser',
          { type: 'button',
            *click() {
              yield* navigatePrevious();
            },
          },
          'Previous user',
        ),
        button(
          'GoToNextUser',
          { type: 'button',
            *click() {
              yield* navigateNext();
            },
          },
          'Next user',
        ),
      ]),
    ]),
);

export default GlobalQuery;
