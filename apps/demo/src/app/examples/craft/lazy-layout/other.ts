import { component, div, p } from '@craft-ng/component';
import {
  componentMonitoring,
  craftException,
  CraftHttpClient,
  craftService,
  provideHostName,
  query,
} from '@craft-ng/core';
import type { User } from '../query/api.service';
import { OtherServiceToYield, provideOtherService } from './to-provide.service';

const { UsersApiOnErrorToYield } = craftService(
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

const { Test2ToYield } = craftService(
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
  function* () {
    componentMonitoring();
    return {
      other: yield* OtherServiceToYield(),
      users: yield* UsersApiOnErrorToYield(),
      test: yield* Test2ToYield(),
    };
  },
  ({ other, users }) =>
    div([p(other.getValue()), p(`Query status: ${users.query.status()}`)]),
);
