import styles from './query.css' with { loader: 'text' };
import { computed } from '@angular/core';
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
  craftMethod,
  CraftRouter,
  insertStoragePersister,
  insertQueryPipe,
  query, craftUse } from '@craft-ng/core';
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
          return yield* ApiService.getItemById(params);
        },
      },
      insertQueryPipe(
        ({ resource }) => ({ hasUser: computed(() => resource.hasValue()) }),
        insertStoragePersister({
          storeName: 'demo-app',
          key: 'user-query',
        }),
      ),
    );
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const navigateNext = craftMethod('navigateNext', function* () {
      const currentUserId = userId();
      const targetUserId = String(Number(currentUserId ?? '0') + 1);
      void router.navigate({
        to: 'query/:userId',
        params: { userId: targetUserId },
      });
    });
    const navigatePrevious = craftMethod('navigatePrevious', function* () {
      const currentUserId = userId();
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
      div({ class: 'query-result' }, [
        'User ',
        StatusComponent({ status: () => craftUse(userQuery.status()) }),
        ifBlock(userQuery.hasUser, () =>
          pre('QueryValue', {}, () =>
            JSON.stringify(craftUse(userQuery.value()), null, 2),
          ),
        ),
      ]),
      p(
        { class: 'query-note' },
        'Reload the page to retrieve the query result from the cache.',
      ),
      div({ class: 'query-actions' }, [
        button(
          'GoToPreviousUser',
          {
            *click() {
              yield* navigatePrevious();
            },
          },
          'Previous user',
        ),
        button(
          'GoToNextUser',
          {
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
