/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
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
    styles: `
      :scope{display:flex;flex-direction:column;align-items:center;gap:20px;padding:32px;font-family:sans-serif}
      .controls{display:flex;gap:12px;align-items:center}
      select{padding:6px 12px;font-size:1rem;border:1px solid #ccc;border-radius:6px}
      .card{min-width:280px;padding:24px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa}
      dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:0}
      dt{font-weight:600;color:#374151}
      dd{margin:0;color:#6b7280}
      .loading{color:#6b7280;font-style:italic}
      .error{color:#dc2626}
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
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
    return div([
      heading('craftService User Detail (query)'),
      div({ class: 'controls' }, [
        select('user',
          {
            'aria-label': 'User',
            value: userId,
            *change(event: Event) {
              yield* userId.selectUser(
                (event.target as HTMLSelectElement).value,
              );
            },
          },
          user.userIds.map((id) => option({ value: id }, `User ${id}`)),
        ),
      ]),
      div({ class: 'card' }, [
        ifNode(
          hasValue,
          () =>
            h('dl', [
              h('dt', 'ID'),
              h('dd', userIdValue),
              h('dt', 'Name'),
              h('dd', userName),
              h('dt', 'Email'),
              h('dd', userEmail),
            ]),
          () =>
            ifNode(
              user.hasException,
              () => p({ class: 'error' }, 'Failed to load user.'),
              () => p({ class: 'loading' }, 'Loading user…'),
            ),
        ),
      ]),
    ]);
  },
);

export default CraftServiceUserDetailComponent;
