import {
  craftComponent,
  div,
  h,
  h2,
  ifBlock,
  option,
  p,
  select,
} from '@craft-ng/component';
import {
  craftComputed,
  craftGen,
  craftService,
  craftSleep,
  query,
  state,
  toValue,
  type MaybeSignal,
} from '@craft-ng/core';

type User = { id: string; name: string; email: string };
const USERS: User[] = [
  { id: '1', name: 'Romain', email: 'romain@craft.dev' },
  { id: '2', name: 'Julien', email: 'julien@craft.dev' },
  { id: '3', name: 'Daniel', email: 'daniel@craft.dev' },
  { id: '4', name: 'Kevin', email: 'kevin@craft.dev' },
  { id: '5', name: 'Lucie', email: 'lucie@craft.dev' },
];

const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  function* () {
    return {
      getUser: craftGen(function* (id: string) {
        yield* craftSleep(600);
        const user = USERS.find((candidate) => candidate.id === id);
        if (!user) throw new Error(`User ${id} not found`);
        return user;
      }),
      availableUserIds: USERS.map(({ id }) => id),
    };
  },
);

const { provideUser, User } = craftService(
  { name: 'User', scope: 'toProvide' },
  function* (inputs: { userId: MaybeSignal<string> }) {
    const api = yield* UsersApi();
    const user = yield* query('user', {
      params: () => toValue(inputs.userId),
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
    `,
  },
  function* () {
    const userId = yield* state('userId', '1', ({ set }) => ({
      selectUser: (value: string) => set(value),
    }));
    return { userId, user: yield* User({ userId }) };
  },
  ({ userId, user }) => {
    const hasValue = craftComputed('hasValue', () => user.hasValue());
    return div([
      h2('craftService User Detail (query)'),
      div({ class: 'controls' }, [
        select(
          {
            value: userId(),
            change: (event) =>
              userId.selectUser((event.target as HTMLSelectElement).value),
          },
          user.userIds.map((id) => option({ value: id }, `User ${id}`)),
        ),
      ]),
      div({ class: 'card' }, [
        ifBlock(
          hasValue,
          () => {
            const value = user.value() as User;
            return h('dl', [
              h('dt', 'ID'),
              h('dd', value.id),
              h('dt', 'Name'),
              h('dd', value.name),
              h('dt', 'Email'),
              h('dd', value.email),
            ]);
          },
          () =>
            ifBlock(
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
