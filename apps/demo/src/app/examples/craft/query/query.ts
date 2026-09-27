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
  Console,
  craftComputed,
  craftMethod,
  CraftRouter,
  craftService,
  insertStoragePersister,
  craftUnique,
  query,
  type CraftServiceInput,
  craftExpose,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';
import { example } from '../../shared/example.style';

const { UserQuery } = craftService(
  { name: 'UserQuery', providedIn: 'global' },
  function* (inputs: { userId: CraftServiceInput<string> }) {
    yield* query(
      'userQuery',
      {
        params: inputs.userId,
        loader: function* ({ params }) {
          yield* Console.log('Loading user with id:', params);
          return yield* ApiService.getItemById(params);
        },
      },
      insertStoragePersister(
        craftUnique({
          storeName: 'demo-app-craft',
          key: 'user-query',
        }),
      ),
    );
  },
);

export const { CraftGlobalQueryView, provideCraftGlobalQueryView } =
  craftService(
    { name: 'craftGlobalQueryView', providedIn: 'toProvide' },
    function* (inputs: { readonly userId: CraftServiceInput<string> }) {
      const { userId } = inputs;

      const { userQuery: user } = yield* UserQuery({
        userId,
      });

      const router = yield* CraftRouter(undefined, ({ navigate }) => ({
        navigate,
      }));

      const navigate = yield* craftMethod('navigate', function* (offset: number) {
        void router.navigate({
          to: 'craft/query/:userId',
          params: {
            userId: String(Number((yield* userId()) ?? '0') + offset),
          },
        });
      });
      yield* craftComputed('hasUser', () => user.hasValue());
      yield* craftComputed('userValueJson', function* () {
        return JSON.stringify(yield* user.value(), null, 2);
      });
      yield* craftExpose('user', user);
    },
  );

const CraftGlobalQuery = craftComponent(
  'CraftGlobalQuery',
  {
    providers: [provideCraftGlobalQueryView()],
  },
  function* (inputs: { readonly userId: Input<string> }) {
    const { user, hasUser, userValueJson, navigate } =
      yield* CraftGlobalQueryView(inputs);
    return div({ class: example.card }, [
      heading({ class: example.title }, 'User query'),
      div({ class: example.result }, [
        'User ',
        StatusComponent({ status: user.status }),
        ifNode(hasUser, () =>
          pre('QueryValue', { class: example.code }, userValueJson),
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
            *click() {
              navigate(-1);
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
            *click() {
              navigate(1);
            },
          },
          'Next user',
        ),
      ]),
    ]);
  },
);

export default CraftGlobalQuery;
