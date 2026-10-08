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
  craftService,
  craftMethod,
  CraftRouter,
  insertStoragePersister,
  craftUnique,
  query,
  craftComputed,
  type CraftServiceInput,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';
import { example } from '../../shared/example.style';

export const { GlobalQueryView, provideGlobalQueryView } = craftService(
  { name: 'globalQueryView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly userId: CraftServiceInput<string> };
  }) {
    const { userId } = inputs.$provided;

    const userQuery = yield* query(
      'userQuery',
      {
        params: userId,
        preservePreviousValue: () => true,
        loader: function* ({ params }) {
          return yield* ApiService.getItemById(params);
        },
      },
      insertStoragePersister(
        craftUnique({
          storeName: 'demo-app',
          key: 'user-query',
        }),
      ),
    );
    yield* craftComputed('hasUser', () => userQuery.hasValue());
    yield* craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* userQuery.value(), null, 2);
    });
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    yield* craftMethod('navigateNext', function* () {
      const currentUserId = yield* userId();
      const targetUserId = String(Number(currentUserId ?? '0') + 1);
      void router.navigate({
        to: 'query/:userId',
        params: { userId: targetUserId },
      });
    });
    yield* craftMethod('navigatePrevious', function* () {
      const currentUserId = yield* userId();
      const targetUserId = String(Number(currentUserId ?? '0') - 1);
      void router.navigate({
        to: 'query/:userId',
        params: { userId: targetUserId },
      });
    });
  },
);

const GlobalQuery = craftComponent(
  'GlobalQuery',
  {},
  (_inputs: { readonly userId: Input<string> }) =>
    div({ class: example.card }, [
      heading({ class: example.title }, 'User query'),
      div({ class: example.result }, [
        'User ',
        StatusComponent({
          status: function* () {
            const { userQuery } = yield* GlobalQueryView();
            return yield* userQuery.status();
          },
        }),
        ifNode(
          'hasUser',
          function* () {
            const { hasUser } = yield* GlobalQueryView();
            return yield* hasUser();
          },
          () =>
            pre('QueryValue', { class: example.code }, function* () {
              const { userValueJson } = yield* GlobalQueryView();
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
            click: function* () {
              (yield* GlobalQueryView()).navigatePrevious();
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
            click: function* () {
              (yield* GlobalQueryView()).navigateNext();
            },
          },
          'Next user',
        ),
      ]),
    ]),
).pipe(
  withComponentProviders(({ userId }) => [provideGlobalQueryView({ userId })]),
);

export default GlobalQuery;
