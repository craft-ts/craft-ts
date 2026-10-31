import {
  craftComponent,
  div,
  h,
  ifNode,
  option,
  p,
  select,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  craftGen,
  craftService,
  craftSleep,
  query,
  state,
  type CraftServiceInput,
  craftException,
  craftExpose,
  craftPrivate,
} from '@craft-ts/core';
import { eventValue } from '../../event-value';
import { example } from '../shared/example.style';

type User = { id: string; name: string; email: string };
const USERS: User[] = [
  { id: '1', name: 'Romain', email: 'romain@craft.dev' },
  { id: '2', name: 'Julien', email: 'julien@craft.dev' },
  { id: '3', name: 'Daniel', email: 'daniel@craft.dev' },
  { id: '4', name: 'Kevin', email: 'kevin@craft.dev' },
  { id: '5', name: 'Lucie', email: 'lucie@craft.dev' },
];
const USER_IDS = USERS.map(({ id }) => id);

const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global' },
  function* () {
    yield* craftExpose(
      'getUser',
      craftGen(function* (id: string) {
        yield* craftSleep(600);
        const user = USERS.find((candidate) => candidate.id === id);
        if (!user)
          return craftException(
            { _tag: 'UNEXPECTED_ERROR' },
            { error: new Error(`User ${id} not found`) },
          );
        return user;
      }),
    );
    yield* craftExpose(
      'availableUserIds',
      USER_IDS,
    );
  },
);

const { User } = craftService(
  { name: 'User', providedIn: 'function' },
  function* (inputs: { userId: CraftServiceInput<string> }) {
    const api = yield* UsersApi();
    yield* query('user', {
      params: function* () {
        return yield* inputs.userId();
      },
      loader: function* ({ params }) {
        return yield* api.getUser(params);
      },
    });
    yield* craftExpose('userIds', api.availableUserIds);
  },
);

export const { CraftServiceUserDetailView, provideCraftServiceUserDetailView } =
  craftService(
    { name: 'craftServiceUserDetailView', providedIn: 'toProvide' },
    function* () {
      const userId = yield* state('userId', '1', ({ set }) => ({
        selectUser: (value: string) => set(value),
      }));
      const { user } = yield* craftPrivate(User({ userId }));
      yield* craftComputed('hasValue', () => user.hasValue());
      yield* craftComputed('hasException', function* () {
        return yield* user.hasException();
      });
      yield* craftComputed('userIdValue', function* () {
        return (yield* user.value())?.id ?? '';
      });
      yield* craftComputed('userName', function* () {
        return (yield* user.value())?.name ?? '';
      });
      yield* craftComputed('userEmail', function* () {
        return (yield* user.value())?.email ?? '';
      });
    },
  );

const CraftServiceUserDetailComponent = craftComponent(
  'CraftServiceUserDetailComponent',
  {
    providers: [provideCraftServiceUserDetailView()],
  },
  () =>
    div({ class: example.centered }, [
      heading({ class: example.title }, 'craftService User Detail (query)'),
      div({ class: example.row, 'data-testid': 'user-controls' }, [
        select(
          'user',
          {
            class: example.select,
            'aria-label': 'User',
            value: CraftServiceUserDetailView.userId,
            *change(event: Event) {
              yield* CraftServiceUserDetailView.userId.selectUser(
                eventValue(event),
              );
            },
          },
          USER_IDS.map((id) => option({ value: id }, `User ${id}`)),
        ),
      ]),
      div({ class: example.box, 'data-testid': 'user-card' }, [
        ifNode(
          'hasValue',
          function* () {
            const { hasValue } = yield* CraftServiceUserDetailView();
            return yield* hasValue();
          },
          () =>
            h('dl', { class: example.definitions }, [
              h('dt', { class: example.term }, 'ID'),
              h('dd', { class: example.definition }, CraftServiceUserDetailView.userIdValue),
              h('dt', { class: example.term }, 'Name'),
              h('dd', { class: example.definition }, CraftServiceUserDetailView.userName),
              h('dt', { class: example.term }, 'Email'),
              h('dd', { class: example.definition }, CraftServiceUserDetailView.userEmail),
            ]),
          () =>
            ifNode(
              'hasException',
              CraftServiceUserDetailView.hasException,
              () =>
                p(
                  { class: example.text, 'data-exampleText': 'error' },
                  'Failed to load user.',
                ),
              () =>
                p(
                  { class: example.text, 'data-exampleText': 'muted' },
                  'Loading user…',
                ),
            ),
        ),
      ]),
    ]),
);

export default CraftServiceUserDetailComponent;
