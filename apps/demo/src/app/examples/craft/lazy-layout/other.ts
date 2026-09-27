import { craftComponent, div, p } from '@craft-ts/component';
import {
  craftException,
  CraftHttpClient,
  craftService,
  query,
  craftExpose,
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
    yield* query('query', {
      params: () => true,
      loader: function* () {
        return users();
      },
    });
    yield* craftExpose('users', users);
  },
);

const { Test2 } = craftService({ name: 'test2', providedIn: 'global' }, function* () {
  // Nothing to expose.
});

export const { OtherView, provideOtherView } = craftService(
  { name: 'otherView', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('other', yield* OtherService());
    yield* craftExpose('users', yield* UsersApiOnError());
    yield* craftExpose('test', yield* Test2());
  },
);

export const OtherComponent = craftComponent(
  'OtherComponent',
  {
    providers: [provideOtherView(), provideOtherService()],
  },
  function* () {
    const { other, users } = yield* OtherView();
    return div([
      p(() => other.getValue()),
      p(function* () {
        return `Query status: ${yield* users.query.status()}`;
      }),
    ]);
  },
);
