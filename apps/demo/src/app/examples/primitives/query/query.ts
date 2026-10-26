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
  isCraftDebugReplayLaunch,
} from '@craft-ts/component';
import {
  craftService,
  craftMethod,
  insertStoragePersister,
  craftUnique,
  query,
  craftComputed,
  type CraftServiceInput,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';
import { example } from '../../shared/example.style';
import { buttonUi } from '@craft-ts/ui/style';
import { UserIdPathParams } from '../../shared/user-id-path-params';

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
        { enabled: !isCraftDebugReplayLaunch() },
      ),
    );
    yield* craftComputed('hasUser', () => userQuery.hasValue());
    yield* craftComputed('userValueJson', function* () {
      return JSON.stringify(yield* userQuery.value(), null, 2);
    });
    const userIdPathParams = yield* UserIdPathParams();
    yield* craftMethod('navigateNext', function* () {
      return yield* userIdPathParams.nextUser();
    });
    yield* craftMethod('navigatePrevious', function* () {
      return yield* userIdPathParams.previousUser();
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
            class: buttonUi.root, 'data-variant': 'secondary',
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
            class: buttonUi.root,
            'data-variant': 'primary',
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
