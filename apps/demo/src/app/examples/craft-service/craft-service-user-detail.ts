import { signal } from '@angular/core';
import {
  component,
  div,
  h,
  h2,
  option,
  p,
  select,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftService,
  craftUse,
  provideHostName,
  query,
  state,
  toValue,
  type GetDeps,
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

const { UsersApiToYield } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    getUser: async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const user = USERS.find((candidate) => candidate.id === id);
      if (!user) throw new Error(`User ${id} not found`);
      return user;
    },
    availableUserIds: USERS.map(({ id }) => id),
  }),
);

const { injectUser, provideUser } = craftService(
  { name: 'User', scope: 'toProvide' },
  function* (inputs: { userId: MaybeSignal<string> }) {
    const api = yield* UsersApiToYield();
    return {
      ...(yield* query({
        params: () => toValue(inputs.userId),
        loader: ({ params }) => api.getUser(params),
      })),
      userIds: api.availableUserIds,
    };
  },
);

const CraftServiceUserDetailComponent = component(
  {
    providers: [
      provideUser(),
      provideHostName('component:CraftServiceUserDetailComponent'),
    ],
  },
  () => {
    componentMonitoring();
    const userId = craftUse(
      state(signal('1'), ({ set }) => ({ setUserId: set })),
    );
    return { userId, user: injectUser({ userId }) };
  },
  ({ userId, user }) => {
    const value = user.safeValue();
    return div([
      h2('craftService User Detail (query)'),
      select(
        {
          value: userId(),
          change: (event) =>
            userId.setUserId((event.target as HTMLSelectElement).value),
        },
        user.userIds.map((id) =>
          option({ value: id }, `User ${id}`),
        ),
      ),
      value
        ? h('dl', [
            h('dt', 'ID'),
            h('dd', value.id),
            h('dt', 'Name'),
            h('dd', value.name),
            h('dt', 'Email'),
            h('dd', value.email),
          ])
        : p(
            user.status() === 'exception'
              ? 'Failed to load user.'
              : 'Loading user…',
          ),
    ]);
  },
);

export default CraftServiceUserDetailComponent;
export type GenDeps_CraftServiceUserDetailComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    User: ReturnType<typeof provideUser>;
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
