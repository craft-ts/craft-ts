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
import { example } from '../../shared/example.style';

const GlobalQuery = craftComponent(
  'GlobalQuery',
  {},
  function* (userId: Input<string>) {
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
        ({ resource }) => ({
          hasUser: craftComputed('hasUser', () => resource.hasValue()),
          userValueJson: craftComputed('userValueJson', function* () {
            return JSON.stringify(yield* resource.value(), null, 2);
          }),
        }),
        insertStoragePersister(
          craftUnique({
            storeName: 'demo-app',
            key: 'user-query',
          }),
        ),
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
    div({ class: example.card }, [
      heading({ class: example.title }, 'User query'),
      div({ class: example.result }, [
        'User ',
        StatusComponent({ status: userQuery.status }),
        ifNode(userQuery.hasUser, () =>
          pre('QueryValue', { class: example.code }, userQuery.userValueJson),
        ),
      ]),
      p(
        { class: example.note },
        'Reload the page to retrieve the query result from the cache.',
      ),
      div({ class: example.actions, 'data-testid': 'query-actions' }, [
        button(
          'GoToPreviousUser',
          { class: example.button, type: 'button', click: navigatePrevious },
          'Previous user',
        ),
        button(
          'GoToNextUser',
          {
            class: example.button,
            'data-exampleButton': 'primary',
            type: 'button',
            click: navigateNext,
          },
          'Next user',
        ),
      ]),
    ]),
);

export default GlobalQuery;
