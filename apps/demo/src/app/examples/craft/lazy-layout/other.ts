import {
  craftComponent,
  div,
  p,
} from '@craft-ts/component';
import {
  craftException,
  CraftHttpClient,
  craftService,
  query,
} from '@craft-ts/core';
import type { User } from '../query/api.service';
import { OtherService, provideOtherService } from './to-provide.service';

const { UsersApiOnError } = craftService(
  { name: 'UsersApiOnError', providedIn: 'global' },
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
              { _tag: 'PASSWORD_REQUIRED', scope: 'AuthApi' },
              { field: 'password' },
            );
          }
          return;
        },
      ],
    }));
    const _query = yield* query('query', {
      params: () => true,
      loader: () => users(),
    });
    return {
      users,
      query: _query,
    };
  },
);

const { Test2 } = craftService({ name: 'test2', providedIn: 'global' }, () => ({}));

export const OtherComponent = craftComponent(
  'OtherComponent',
  {
    providers: [provideOtherService()],
  },
  function* () {
    return {
      other: yield* OtherService(),
      users: yield* UsersApiOnError(),
      test: yield* Test2(),
    };
  },
  ({ other, users }) =>
    div([
      p(() => other.getValue()),
      p(function* () {
        return `Query status: ${yield* users.query.status()}`;
      }),
    ]),
);
