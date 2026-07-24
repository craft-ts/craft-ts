import { component, div, p } from '@craft-ng/component';
import {
  componentMonitoring,
  craftException,
  CraftHttpClient,
  craftService,
  provideHostName,
  query,
  type GetDeps,
} from '@craft-ng/core';
import type { User } from '../query/api.service';
import {
  injectOtherService,
  provideOtherService,
} from './to-provide.service';

const { injectUsersApiOnError } = craftService(
  { name: 'UsersApiOnError', scope: 'global' },
  function* () {
    const users = yield* CraftHttpClient.get(({ response }) => ({
      url: 'users',
      success: response<User[]>(),
      exceptions: [
        function* ({ status, code, content }) {
          if (
            (yield* status(400)) &&
            (yield* code('PASSWORD_REQUIRED')) &&
            (yield* content('Password is required'))
          ) {
            return craftException(
              { code: 'PASSWORD_REQUIRED', scope: 'AuthApi' },
              { field: 'password' },
            );
          }
          return;
        },
      ],
    }));
    return {
      users,
      query: yield* query({
        params: () => true,
        loader: () => users(),
      }),
    };
  },
);

const { injectTest2 } = craftService(
  { name: 'test2', scope: 'global' },
  () => ({}),
);

export const OtherComponent = component(
  {
    providers: [
      provideOtherService(),
      provideHostName('component:OtherComponent'),
    ],
  },
  () => {
    componentMonitoring();
    return {
      other: injectOtherService(),
      users: injectUsersApiOnError(),
      test: injectTest2(),
    };
  },
  ({ other, users }) =>
    div([
      p(other.getValue()),
      p(`Query status: ${users.query.status()}`),
    ]),
);

export type GenDeps_OtherComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    OtherService: ReturnType<typeof provideOtherService>;
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
