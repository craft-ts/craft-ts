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

const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global' },
  function* () {
    return {
      getUser: craftGen(function* (id: string) {
        yield* craftSleep(600);
        const user = USERS.find((candidate) => candidate.id === id);
        if (!user)
          return craftException(
            { _tag: 'UNEXPECTED_ERROR' },
            { error: new Error(`User ${id} not found`) },
          );
        return user;
      }),
      availableUserIds: USERS.map(({ id }) => id),
    };
  },
);

const { provideUser, User } = craftService(
  { name: 'User', providedIn: 'toProvide' },
  function* (inputs: { userId: CraftServiceInput<string> }) {
    const api = yield* UsersApi();
    const user = yield* query('user', {
      params: function* () {
        return yield* inputs.userId();
      },
      loader: function* ({ params }) {
        return yield* api.getUser(params);
      },
    });
    return {
      ...user,
      userIds: api.availableUserIds,
    };
  },
);

const CraftServiceUserDetailComponent = craftComponent(
  'CraftServiceUserDetailComponent',
  {
    providers: [provideUser()],
  },
  function* () {
    const userId = yield* state('userId', '1', ({ set }) => ({
      selectUser: (value: string) => set(value),
    }));
    const user = yield* User({ userId });
    const hasValue = craftComputed('hasValue', () => user.hasValue());
    const userIdValue = craftComputed('userIdValue', function* () {
      return (yield* user.value())?.id ?? '';
    });
    const userName = craftComputed('userName', function* () {
      return (yield* user.value())?.name ?? '';
    });
    const userEmail = craftComputed('userEmail', function* () {
      return (yield* user.value())?.email ?? '';
    });
    return { userId, user, hasValue, userIdValue, userName, userEmail };
  },
  ({ userId, user, hasValue, userIdValue, userName, userEmail }) => {
    return div({ class: example.centered }, [
      heading({ class: example.title }, 'craftService User Detail (query)'),
      div({ class: example.row, 'data-testid': 'user-controls' }, [
        select('user',
          { class: example.select,
            'aria-label': 'User',
            value: userId,
            *change(event: Event) {
              yield* userId.selectUser(
                eventValue(event),
              );
            },
          },
          user.userIds.map((id) => option({ value: id }, `User ${id}`)),
        ),
      ]),
      div({ class: example.box, 'data-testid': 'user-card' }, [
        ifNode(
          hasValue,
          () =>
            h('dl', { class: example.definitions }, [
              h('dt', { class: example.term }, 'ID'),
              h('dd', { class: example.definition }, userIdValue),
              h('dt', { class: example.term }, 'Name'),
              h('dd', { class: example.definition }, userName),
              h('dt', { class: example.term }, 'Email'),
              h('dd', { class: example.definition }, userEmail),
            ]),
          () =>
            ifNode(
              user.hasException,
              () => p({ class: example.text, 'data-exampleText': 'error' }, 'Failed to load user.'),
              () => p({ class: example.text, 'data-exampleText': 'muted' }, 'Loading user…'),
            ),
        ),
      ]),
    ]);
  },
);

export default CraftServiceUserDetailComponent;
